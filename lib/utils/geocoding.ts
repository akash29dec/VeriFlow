/**
 * Geocoding Utilities
 * Google Maps API integration for address-to-coordinates conversion
 */

import type { PropertyCoordinates } from '@/types/database';

/**
 * Geocoding API response
 */
export interface GeocodingResult {
  success: boolean;
  coordinates: PropertyCoordinates | null;
  formattedAddress: string | null;
  error: string | null;
}

/**
 * Google Maps Geocoding API response structure
 */
interface GoogleGeocodingResponse {
  results: {
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    formatted_address: string;
  }[];
  status: string;
  error_message?: string;
}

/**
 * Convert an address to GPS coordinates using Google Maps Geocoding API
 * 
 * @param address - Full address string to geocode
 * @returns Geocoding result with coordinates
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY is not configured');
    return {
      success: false,
      coordinates: null,
      formattedAddress: null,
      error: 'Geocoding service not configured',
    };
  }

  if (!address || address.trim().length === 0) {
    return {
      success: false,
      coordinates: null,
      formattedAddress: null,
      error: 'Address is required',
    };
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

    const response = await fetch(url);
    const data: GoogleGeocodingResponse = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0];
      return {
        success: true,
        coordinates: {
          lat: result.geometry.location.lat,
          lon: result.geometry.location.lng,
        },
        formattedAddress: result.formatted_address,
        error: null,
      };
    }

    // Handle specific error statuses
    const errorMessages: Record<string, string> = {
      ZERO_RESULTS: 'No results found for this address',
      OVER_QUERY_LIMIT: 'Geocoding quota exceeded',
      REQUEST_DENIED: 'Geocoding request denied',
      INVALID_REQUEST: 'Invalid address format',
      UNKNOWN_ERROR: 'Geocoding service error',
    };

    return {
      success: false,
      coordinates: null,
      formattedAddress: null,
      error: errorMessages[data.status] || data.error_message || 'Geocoding failed',
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return {
      success: false,
      coordinates: null,
      formattedAddress: null,
      error: 'Network error during geocoding',
    };
  }
}

/**
 * Reverse geocode coordinates to an address
 * 
 * @param coordinates - GPS coordinates to reverse geocode
 * @returns Address string or null
 */
export async function reverseGeocode(
  coordinates: PropertyCoordinates
): Promise<GeocodingResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      coordinates,
      formattedAddress: null,
      error: 'Geocoding service not configured',
    };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coordinates.lat},${coordinates.lon}&key=${apiKey}`;

    const response = await fetch(url);
    const data: GoogleGeocodingResponse = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      return {
        success: true,
        coordinates,
        formattedAddress: data.results[0].formatted_address,
        error: null,
      };
    }

    return {
      success: false,
      coordinates,
      formattedAddress: null,
      error: 'Could not determine address for these coordinates',
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return {
      success: false,
      coordinates,
      formattedAddress: null,
      error: 'Network error during reverse geocoding',
    };
  }
}

/**
 * Validate if coordinates are within India (approximate bounding box)
 * Used for initial sanity check on property coordinates
 */
export function isCoordinatesInIndia(coords: PropertyCoordinates): boolean {
  // India bounding box (approximate)
  const INDIA_BOUNDS = {
    minLat: 6.0,
    maxLat: 36.0,
    minLon: 68.0,
    maxLon: 98.0,
  };

  return (
    coords.lat >= INDIA_BOUNDS.minLat &&
    coords.lat <= INDIA_BOUNDS.maxLat &&
    coords.lon >= INDIA_BOUNDS.minLon &&
    coords.lon <= INDIA_BOUNDS.maxLon
  );
}

/**
 * Generate a Google Maps URL for given coordinates
 */
export function getGoogleMapsUrl(coords: PropertyCoordinates): string {
  return `https://www.google.com/maps?q=${coords.lat},${coords.lon}`;
}

/**
 * Generate a Google Maps embed URL for given coordinates
 */
export function getGoogleMapsEmbedUrl(coords: PropertyCoordinates): string {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return '';
  }
  return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${coords.lat},${coords.lon}&zoom=17`;
}
