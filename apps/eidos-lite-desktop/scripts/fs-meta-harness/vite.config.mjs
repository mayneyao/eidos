import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
const root = fileURLToPath(new URL("./", import.meta.url))
export default defineConfig({
  root,
  plugins: [react()],
  server: {
    port: 5186,
    strictPort: true,
    host: "localhost",
    fs: { allow: [fileURLToPath(new URL("../../../../", import.meta.url))] },
  },
  resolve: {
    alias: [
      {
        find: "@eidos.space/eidos-file",
        replacement: fileURLToPath(
          new URL(
            "../../../../packages/eidos-file/src/index.ts",
            import.meta.url
          )
        ),
      },
    ],
  },
})
