/** @type {import('next').NextConfig} */
const nextConfig = {
  // Отключаем ESLint при сборке (включите после настройки)
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Строгий режим React
  reactStrictMode: true,
  // Логирование запросов в dev-режиме
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },
};

module.exports = nextConfig;
