import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/chronicle/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:8080"}/chronicle/:path*`,
      },
    ];
  },
};

export default nextConfig;
