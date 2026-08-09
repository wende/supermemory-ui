import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["d3-force", "d3-zoom", "d3-selection", "d3-quadtree"],
  async redirects() {
    return [
      {
        source: "/search",
        destination: "/memories?mode=semantic",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
