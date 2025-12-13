/**
 * Get the API base URL based on the current environment
 * - Uses localhost:3000 in development
 * - Uses api.eclaire.com in production
 */
export function getApiBaseUrl(): string {
  // In Next.js, this code runs during both SSR and client-side rendering
  // By removing any window checks and only using process.env.NODE_ENV,
  // we ensure the same URL is generated on both server and client
  return process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://api.eclaire.com";
}
