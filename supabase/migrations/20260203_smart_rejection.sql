-- Smart Rejection Feedback Loop - Database Schema Updates
-- Run this in your Supabase SQL Editor

-- Step 1: Add new columns to verifications table
ALTER TABLE verifications 
ADD COLUMN IF NOT EXISTS rejection_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_reason JSONB DEFAULT NULL;

-- Step 2: Add 'needs_revision' to the status check constraint
-- First, we need to drop the existing constraint and recreate it with the new value

-- Check existing constraint (run this first to see current values):
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'verifications'::regclass AND contype = 'c';

-- Drop existing status constraint (adjust name if different)
ALTER TABLE verifications DROP CONSTRAINT IF EXISTS verifications_status_check;

-- Recreate with 'needs_revision' added
ALTER TABLE verifications ADD CONSTRAINT verifications_status_check 
CHECK (status IN ('draft', 'pending', 'in_progress', 'submitted', 'approved', 'rejected', 'cancelled', 'needs_revision'));

-- Optional: Add index for faster queries on status
CREATE INDEX IF NOT EXISTS idx_verifications_status ON verifications(status);
CREATE INDEX IF NOT EXISTS idx_verifications_rejection_count ON verifications(rejection_count);

-- Verify changes
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'verifications' 
AND column_name IN ('rejection_count', 'rejection_reason');
