/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin', 'google-auth-library', '@google-cloud/firestore'],
  },
}

export default nextConfig
