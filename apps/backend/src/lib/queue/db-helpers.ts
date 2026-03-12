// Re-export database queue helpers from @eclaire/queue core
export { getScheduledTime, isJobExpired, isJobReady } from "@eclaire/queue/core";

/**
 * Get expiration timestamp
 * @param minutes - Number of minutes from now
 * @returns Date object for expiration time
 */
export function getExpirationTime(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
