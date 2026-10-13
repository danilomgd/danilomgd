import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  typedRoutes: false,
  agentRules: false,
};

export default nextConfig;
