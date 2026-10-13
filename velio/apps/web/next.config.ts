import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@velio/contracts', '@velio/api-client', '@velio/ui'],
  typedRoutes: false,
  images: { unoptimized: true },
};

export default nextConfig;
