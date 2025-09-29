// next.config.mjs

import withPWA from "next-pwa";

/**
 * PWA-specific configuration.
 * These options are passed to the next-pwa plugin.
 */
const pwaConfig = {
  dest: "public", // Destination directory for the service worker files.
  register: true, // Automatically register the service worker.
  skipWaiting: true, // Force the waiting service worker to become the active one.
  disable: process.env.NODE_ENV === "development", // Disable PWA in development mode.
  runtimeCaching: [
    // Caching strategy for static assets (images, fonts, etc.)
    {
      urlPattern: /^https?.*\.(png|jpe?g|webp|svg|gif|tiff|js|css)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "static-assets",
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
      },
    },
    // Caching strategy for Google Fonts
    {
      urlPattern: /^https?:\/\/.*\.(?:googleapis|gstatic)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 365 * 24 * 60 * 60, // 365 days
        },
      },
    },
    // Caching strategy for API calls
    {
      urlPattern: /\/api\/.*$/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "apis",
        expiration: {
          maxEntries: 16,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
        networkTimeoutSeconds: 10, // Fallback to cache if network takes too long
      },
    },
  ],
};

/**
 * Main Next.js configuration.
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Enable standalone output for optimized Docker images
  output: "standalone",

  // Disable dev indicators in development
  devIndicators: false,

  // Experimental features
  experimental: {
    // instrumentationHook is no longer needed - instrumentation.ts works by default
  },

  // ESLint and TypeScript settings for faster builds
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Image optimization settings
  images: {
    // Keep unoptimized: true commented out unless you have a specific reason
    // unoptimized: true,
    domains: [], // Add any external image domains here
  },

  // URL rewrites
  async rewrites() {
    return [];
  },

  // URL redirects
  async redirects() {
    return [
      // Add any permanent redirects here
    ];
  },

  // Custom headers for specific paths
  async headers() {
    const headers = [
      {
        source: "/api-docs/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, s-maxage=3600",
          },
        ],
      },
    ];

    // Add security headers for production
    if (process.env.NODE_ENV === "production") {
      headers.push({
        source: "/(.*)",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'self';",
          },
        ],
      });
    }

    return headers;
  },
};

// Create the PWA-enabled config by wrapping the Next.js config.
// The withPWA function is a higher-order function:
// 1. You call it with the PWA config, which returns a new function.
// 2. You call the returned function with your main Next.js config.
const createPwaConfig = withPWA(pwaConfig);
const finalConfig = createPwaConfig(nextConfig);

export default finalConfig;
