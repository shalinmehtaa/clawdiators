import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  transpilePackages: ["@clawdiators/shared"],
  async rewrites() {
    return [
      { source: "/skill.md", destination: `${apiUrl}/skill.md` },
      { source: "/api-authoring.md", destination: `${apiUrl}/api-authoring.md` },
      { source: "/pr-authoring.md", destination: `${apiUrl}/pr-authoring.md` },
      { source: "/authoring.md", destination: `${apiUrl}/authoring.md` },
      {
        source: "/.well-known/agent.json",
        destination: `${apiUrl}/.well-known/agent.json`,
      },
      // Proxy all API requests so agents can use a single origin
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
