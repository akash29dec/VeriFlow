-- ============================================================================
-- COMPREHENSIVE FIX V2: Trigger + RLS + Dynamic Workload
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. DROP OLD TRIGGERS AND FUNCTION
-- ============================================================================

DROP TRIGGER IF EXISTS trg_assign_verifier ON public.verifications;
DROP TRIGGER IF EXISTS trg_assign_verifier_update ON public.verifications;
DROP FUNCTION IF EXISTS assign_verifier();


-- ============================================================================
-- 2. ENHANCED assign_verifier FUNCTION (INSERT and UPDATE)
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_verifier()
RETURNS TRIGGER AS $$
DECLARE
  selected_verifier_id UUID;
  policy_type TEXT;
  policy_business_id UUID;
  needs_assignment BOOLEAN := FALSE;
BEGIN
  -- Determine if we need to run auto-assignment
  IF TG_OP = 'INSERT' THEN
    -- On INSERT: assign if no verifier is set
    needs_assignment := (NEW.assigned_verifier_id IS NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    -- On UPDATE: re-assign if verifier was cleared OR policy changed
    needs_assignment := (
      (NEW.assigned_verifier_id IS NULL AND OLD.assigned_verifier_id IS NOT NULL) OR
      (NEW.assigned_verifier_id IS NULL AND NEW.policy_id IS DISTINCT FROM OLD.policy_id)
    );
  END IF;

  -- Exit early if no assignment needed
  IF NOT needs_assignment THEN
    RETURN NEW;
  END IF;

  -- Get the policy type and business_id
  SELECT p.policy_type, p.business_id 
  INTO policy_type, policy_business_id
  FROM policies p 
  WHERE p.id = NEW.policy_id;

  IF policy_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find the ideal verifier using round-robin:
  -- ONLY count 'pending' and 'in_progress' as ACTIVE workload
  -- (NOT 'submitted', 'approved', 'rejected', 'completed', 'cancelled')
  SELECT u.id INTO selected_verifier_id
  FROM public.users u
  LEFT JOIN (
    SELECT 
      assigned_verifier_id,
      COUNT(*) as active_count
    FROM public.verifications
    WHERE status IN ('pending', 'in_progress')
    GROUP BY assigned_verifier_id
  ) v ON u.id = v.assigned_verifier_id
  WHERE u.role = 'verifier'
    AND u.is_active = true
    AND u.business_id = policy_business_id
    AND (u.specialization = policy_type OR u.specialization IS NULL)
  ORDER BY COALESCE(v.active_count, 0) ASC, RANDOM()
  LIMIT 1;

  IF selected_verifier_id IS NOT NULL THEN
    NEW.assigned_verifier_id := selected_verifier_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for INSERT
CREATE TRIGGER trg_assign_verifier
  BEFORE INSERT ON public.verifications
  FOR EACH ROW
  EXECUTE FUNCTION assign_verifier();

-- Trigger for UPDATE (when verifier is cleared)
CREATE TRIGGER trg_assign_verifier_update
  BEFORE UPDATE ON public.verifications
  FOR EACH ROW
  WHEN (
    NEW.assigned_verifier_id IS NULL AND 
    (OLD.assigned_verifier_id IS NOT NULL OR OLD.policy_id IS DISTINCT FROM NEW.policy_id)
  )
  EXECUTE FUNCTION assign_verifier();


-- ============================================================================
-- 3. RLS POLICIES FOR VERIFICATIONS TABLE
-- Critical Fix: Verifiers can see ALL their tasks, not just pending
-- ============================================================================

ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Verifiers can view assigned verifications" ON public.verifications;
DROP POLICY IF EXISTS "Verifiers can update assigned verifications" ON public.verifications;
DROP POLICY IF EXISTS "Admins can view all business verifications" ON public.verifications;
DROP POLICY IF EXISTS "Admins can manage all business verifications" ON public.verifications;
DROP POLICY IF EXISTS "Public insert for customer verifications" ON public.verifications;
DROP POLICY IF EXISTS "Service role full access" ON public.verifications;

-- POLICY 1: Verifiers can SELECT ALL their assigned verifications (ANY status)
CREATE POLICY "Verifiers can view assigned verifications"
ON public.verifications
FOR SELECT
USING (
  assigned_verifier_id = auth.uid()
);

-- POLICY 2: Verifiers can UPDATE their assigned verifications
CREATE POLICY "Verifiers can update assigned verifications"
ON public.verifications
FOR UPDATE
USING (
  assigned_verifier_id = auth.uid()
);

-- POLICY 3: Admins can view ALL verifications in their business
CREATE POLICY "Admins can view all business verifications"
ON public.verifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.policies p
    JOIN public.users u ON u.business_id = p.business_id
    WHERE p.id = public.verifications.policy_id
    AND u.id = auth.uid()
    AND u.role IN ('super_admin', 'business_admin')
  )
);

-- POLICY 4: Admins can INSERT/UPDATE/DELETE in their business
CREATE POLICY "Admins can manage all business verifications"
ON public.verifications
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.policies p
    JOIN public.users u ON u.business_id = p.business_id
    WHERE p.id = public.verifications.policy_id
    AND u.id = auth.uid()
    AND u.role IN ('super_admin', 'business_admin')
  )
);

-- POLICY 5: Allow INSERT for customer verifications (via API with service role)
CREATE POLICY "Public insert for customer verifications"
ON public.verifications
FOR INSERT
WITH CHECK (true);


-- ============================================================================
-- 4. RLS POLICIES FOR SUBMISSIONS TABLE
-- ============================================================================

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Verifiers can view submissions for their verifications" ON public.submissions;
DROP POLICY IF EXISTS "Admins can view all submissions" ON public.submissions;
DROP POLICY IF EXISTS "Public insert for submissions" ON public.submissions;

-- Verifiers can view submissions for their assigned verifications
CREATE POLICY "Verifiers can view submissions for their verifications"
ON public.submissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.verifications v
    WHERE v.id = public.submissions.verification_id
    AND v.assigned_verifier_id = auth.uid()
  )
);

-- Admins can view all submissions
CREATE POLICY "Admins can view all submissions"
ON public.submissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.verifications v
    JOIN public.policies p ON p.id = v.policy_id
    JOIN public.users u ON u.business_id = p.business_id
    WHERE v.id = public.submissions.verification_id
    AND u.id = auth.uid()
    AND u.role IN ('super_admin', 'business_admin')
  )
);

-- Public insert for submissions (customers via API)
CREATE POLICY "Public insert for submissions"
ON public.submissions
FOR INSERT
WITH CHECK (true);


-- ============================================================================
-- 5. DYNAMIC WORKLOAD VIEW (Real-time calculation)
-- ============================================================================

DROP VIEW IF EXISTS public.verifier_workload;

CREATE VIEW public.verifier_workload AS
SELECT 
  u.id,
  u.full_name,
  u.email,
  u.specialization,
  u.is_active,
  u.business_id,
  -- Active = Only pending + in_progress
  (SELECT COUNT(*) FROM public.verifications v 
   WHERE v.assigned_verifier_id = u.id 
   AND v.status IN ('pending', 'in_progress')) as active_count,
  -- Pending Review = submitted (customer submitted, awaiting verifier review)
  (SELECT COUNT(*) FROM public.verifications v 
   WHERE v.assigned_verifier_id = u.id 
   AND v.status = 'submitted') as pending_review_count,
  -- Completed = approved + rejected
  (SELECT COUNT(*) FROM public.verifications v 
   WHERE v.assigned_verifier_id = u.id 
   AND v.status IN ('approved', 'rejected')) as completed_count,
  -- Total = all assigned to this verifier
  (SELECT COUNT(*) FROM public.verifications v 
   WHERE v.assigned_verifier_id = u.id) as total_assigned
FROM public.users u
WHERE u.role = 'verifier';

GRANT SELECT ON public.verifier_workload TO authenticated;


-- ============================================================================
-- 6. ENSURE submissions TABLE ACCEPTS DYNAMIC CATEGORIES
-- The categories column should be JSONB to accept any structure
-- ============================================================================

-- Check that categories column exists and is JSONB
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'submissions' AND column_name = 'categories'
  ) THEN
    ALTER TABLE public.submissions ADD COLUMN categories JSONB DEFAULT '[]'::jsonb;
    RAISE NOTICE 'Added categories column to submissions table';
  END IF;
END $$;


-- ============================================================================
-- DONE! Summary:
-- 1. assign_verifier trigger now runs on INSERT and UPDATE
-- 2. Verifiers can see ALL statuses (not just pending)
-- 3. Active count only includes pending + in_progress
-- 4. verifier_workload view provides real-time counts
-- 5. submissions.categories accepts any JSONB structure
-- ============================================================================
