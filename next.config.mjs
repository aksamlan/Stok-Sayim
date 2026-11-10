/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // API yanıtları hiçbir ara katmanda (Cloudflare dahil) önbelleğe
        // alınmasın: yetkili veriler kullanıcılar arasında sızamaz.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
    ]
  },
}

export default nextConfig
