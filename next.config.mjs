/** @type {import('next').NextConfig} */
const legacyDbOrigin = "https://soccer-time-b4nj56nru-killjoy00s-projects.vercel.app";

const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/data/epl.json", destination: "/api/catalog" },
        { source: "/api/db/:path*", destination: `${legacyDbOrigin}/api/db/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};
export default nextConfig;
