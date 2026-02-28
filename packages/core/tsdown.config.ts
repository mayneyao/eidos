import { defineConfig } from "tsdown"
import path from "path"

export default defineConfig({
  entry: ["./index.ts"],
  dts: true,
  alias: {
    "@/lib": path.resolve(__dirname, "../lib"),
    "@": path.resolve(__dirname, "../.."),
  },
})
