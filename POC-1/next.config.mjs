/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // avoids double-mount churn on the realtime subscription + countdown loop in dev
};

export default nextConfig;
