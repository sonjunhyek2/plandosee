/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: "/plandosee",
  trailingSlash: true,
  reactStrictMode: true,
  transpilePackages: ["@plandosee/shared"],
};
export default nextConfig;
