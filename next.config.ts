import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  // O projeto pode viver fora de um repo git; sem isso o Next sobe procurando
  // lockfile na home e avisa no console.
  outputFileTracingRoot: __dirname,
}

export default nextConfig
