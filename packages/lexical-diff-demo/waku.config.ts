import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "waku/config"

export default defineConfig({
  vite: {
    plugins: [
      tailwindcss(),
      react({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),
    ],
    resolve: {
      // 优先使用 browser 字段
      browserField: true,
      mainFields: ["browser", "module", "main"],
    },
    server: {
      fs: {
        // 允许访问 workspace 中的其他包
        allow: [".."],
      },
    },
    build: {
      target: "esnext",
    },
  },
})
