/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/data/epl-live.json", destination: "/api/catalog" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};
export default nextConfig;
