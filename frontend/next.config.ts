import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  output: 'standalone',
  outputFileTracingRoot: path.resolve(__dirname),

  // Treat ESLint warnings as non-fatal during builds — TS type checking still runs.
  eslint: {
    ignoreDuringBuilds: true,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },

  images: {
    // Wildcards skip optimization and are a security risk; list known hosts explicitly
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // `turbopack: {}` (top-level) and `webpack()` both present = conflict:
  // turbopack ignores webpack config entirely. Remove one.
  // Keep webpack for production builds; turbopack is dev-only via `next dev --turbo`.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, './'),
    };
    return config;
  },
};

export default nextConfig;
