/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true,
    // this is for third party workers, not used in this project
    // nextScriptWorkers: true, 
  },
  async headers() {
    // add header for support opfs
    // https://sqlite.org/wasm/doc/trunk/persistence.md#coop-coep
    return [
      {
        source: '/(.*)',
        // Cross-Origin-Embedder-Policy: require-corp
        // Cross-Origin-Opener-Policy: same-origin
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },
}

export default nextConfig
