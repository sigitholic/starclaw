/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    // Izinkan akses dari IP lokal jaringan saat development
    // Tambahkan IP lain jika diperlukan
    "192.168.36.17",
    "192.168.36.0/24",
  ],
};

module.exports = nextConfig;
