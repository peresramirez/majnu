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
