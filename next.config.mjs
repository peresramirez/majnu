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
  // and .next) in .claude/worktrees/. Without this, their writes make the dev
  // server here recompile constantly.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/node_modules/**", "**/.git/**", "**/.next/**", "**/.claude/worktrees/**"],
      }
    }
    return config
  },
}

export default nextConfig
