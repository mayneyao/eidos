import { describe, it, expect } from "vitest"
import {
  $getNodePersistentId,
  $setNodePersistentId,
  $hasNodePersistentId,
  $ensureNodePersistentId,
  generatePersistentId,
  PERSISTENT_ID_KEY,
} from "./node-state"

describe("Persistent ID System", () => {
  describe("generatePersistentId", () => {
    it("should generate a valid ID without hyphens", () => {
      const id = generatePersistentId()

      // Should be 32 characters without hyphens
      expect(id).toHaveLength(32)

      // Should not contain hyphens
      expect(id).not.toContain("-")

      // Should be valid hex string
      expect(id).toMatch(/^[0-9a-f]{32}$/)
    })

    it("should generate unique IDs", () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generatePersistentId())
      }
      expect(ids.size).toBe(100)
    })
  })

  describe("Node State Key", () => {
    it("should have correct key", () => {
      expect(PERSISTENT_ID_KEY).toBe("pid")
    })
  })
})
