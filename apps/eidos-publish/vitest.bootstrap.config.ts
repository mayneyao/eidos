import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/file-bootstrap.test.ts", "test/form-client.test.ts"],
  },
})
