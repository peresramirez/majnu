import path from "node:path"

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // The pinned three.js for custom designs. In production public/_headers sets
  // the same headers on the static asset; this covers the dev server and
  // anything Next serves itself. Access-Control-Allow-Origin is needed because
  // a design's module import comes from an opaque (sandboxed) origin.
  async headers() {
    return [
      {
        source: "/vendor/three/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ]
  },
  // Parallel agent sessions keep their worktrees (with their own node_modules
  // and .next) in .claude/worktrees/. In the main checkout, their writes would
  // make the dev server recompile constantly, so it ignores that folder. Inside
  // a worktree the project itself lives under that path, so nothing extra is
  // ignored there, or the session's own edits would never be picked up.
  webpack: (config, { dev }) => {
    if (dev && !process.cwd().includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`)) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/.next/**", path.join(process.cwd(), ".claude/worktrees/**")],
      }
    }
    return config
  },
}

export default nextConfig
