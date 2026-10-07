// v3/frontend/next.config.js
// Add output: 'standalone' for Docker support

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',   // Required for Docker multi-stage build
    typescript: {
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    experimental: {
        // Keep existing experimental config if any
    },
};

module.exports = nextConfig;