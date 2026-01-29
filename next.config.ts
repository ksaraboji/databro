import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  output: isDev ? undefined : "export",
  trailingSlash: true,
  // Configure Webpack to handle transformers.js dependencies
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },
  async headers() {
    if (!isDev) return [];
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
