import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emits .next/standalone: a self-contained server with only the modules it
  // actually imports, so the runtime image needs no node_modules copy and no
  // package manager. Required by apps/salvage-console/Dockerfile.
  output: "standalone",
};

export default nextConfig;
