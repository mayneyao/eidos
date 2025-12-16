import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/server/index.ts',
    './src/transports/index.ts',
    './src/middleware/index.ts'
  ],
  dts: true,
  format: ['esm'],
})

