// v3/frontend/next.config.js
// Add output: 'standalone' for Docker support

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',   // Required for Docker multi-stage build
    experimental: {
        // Keep existing experimental config if any
    },
};

module.exports = nextConfig;