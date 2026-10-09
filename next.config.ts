import type { NextConfig } from "next";
const nextConfig: NextConfig = { reactStrictMode: true, serverExternalPackages: ['nodemailer','pg'] };
export default nextConfig;
