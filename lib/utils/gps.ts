/**
 * GPS Utility Functions
 * Haversine distance calculation and GPS validation
 */

import type { PropertyCoordinates } from '@/types/database';

/**
 * Earth's radius in meters
 */
const EARTH_RADIUS_METERS = 6371000;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate the Haversine distance between two GPS coordinates
 * Returns distance in meters
 * 
 * @param coord1 - First coordinate (lat/lon)
 * @param coord2 - Second coordinate (lat/lon)
 * @returns Distance in meters
 */
export function calculateHaversineDistance(
  coord1: PropertyCoordinates,
  coord2: PropertyCoordinates
): number {
  const lat1Rad = toRadians(coord1.lat);
  const lat2Rad = toRadians(coord2.lat);
  const deltaLat = toRadians(coord2.lat - coord1.lat);
  const deltaLon = toRadians(coord2.lon - coord1.lon);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * GPS validation result
 */
export interface GPSValidationResult {
  isValid: boolean;
  distance: number | null;
  withinTolerance: boolean;
  message: string;
}

/**
 * Validate GPS coordinates against expected property location
 * 
 * @param capturedCoords - Coordinates captured at time of photo
 * @param expectedCoords - Expected property coordinates
 * @param toleranceMeters - Allowed tolerance in meters (default: 100)
 * @returns Validation result with distance and status
 */
export function validateGPSLocation(
  capturedCoords: PropertyCoordinates | null,
  expectedCoords: PropertyCoordinates | null,
  toleranceMeters: number = 100
): GPSValidationResult {
  // No GPS data captured
  if (!capturedCoords) {
    return {
      isValid: false,
      distance: null,
      withinTolerance: false,
      message: 'No GPS data captured',
    };
  }

  // No expected coordinates to validate against
  if (!expectedCoords) {
    return {
      isValid: true,
      distance: null,
      withinTolerance: true,
      message: 'No property coordinates to validate against',
    };
  }

  const distance = calculateHaversineDistance(capturedCoords, expectedCoords);
  const withinTolerance = distance <= toleranceMeters;

  return {
    isValid: true,
    distance: Math.round(distance),
    withinTolerance,
    message: withinTolerance
      ? `Within ${toleranceMeters}m of expected location (${Math.round(distance)}m)`
      : `Outside tolerance: ${Math.round(distance)}m away (max: ${toleranceMeters}m)`,
  };
}

/**
 * Check if GPS is required for a given policy type
 * GPS validation only applies to property-based policies (home insurance)
 */
export function isGPSRequiredForPolicyType(policyType: string): boolean {
  const propertyPolicyTypes = ['home_insurance', 'property_insurance'];
  return propertyPolicyTypes.includes(policyType);
}

/**
 * Format coordinates for display
 */
export function formatCoordinates(coords: PropertyCoordinates): string {
  return `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`;
}
