import { ExtensionTable } from "./extension"
import type { IExtension } from "../types/IExtension"

// Mock DataSpace for testing
class MockDataSpace {
  private extensions: any[] = []
  private idCounter = 1

  async exec2(sql: string, params: any[] = []): Promise<any[]> {
    // Mock implementation for testing slug uniqueness
    if (sql.includes("SELECT COUNT(*) as count")) {
      // Handle slugExists query
      const slug = params[0]
      const count = this.extensions.filter((ext) => ext.slug === slug).length
      return [{ count }]
    }

    if (sql.includes("SELECT * FROM") && sql.includes("WHERE slug = ?")) {
      // Handle getExtensionBySlug query
      const slug = params[0]
      const extension = this.extensions.find((ext) => ext.slug === slug)
      return extension ? [extension] : []
    }

    if (sql.includes("GROUP_CONCAT(id)")) {
      // Handle fixDuplicateSlugs query
      const slugGroups: { [key: string]: string[] } = {}
      this.extensions.forEach((ext) => {
        if (ext.slug) {
          if (!slugGroups[ext.slug]) {
            slugGroups[ext.slug] = []
          }
          slugGroups[ext.slug].push(ext.id)
        }
      })

      return Object.entries(slugGroups)
        .filter(([, ids]) => ids.length > 1)
        .map(([slug, ids]) => ({
          slug,
          count: ids.length,
          ids: ids.join(","),
        }))
    }

    if (sql.includes("UPDATE") && sql.includes("SET slug = ?")) {
      // Handle slug update
      const [newSlug, id] = params
      const extension = this.extensions.find((ext) => ext.id === id)
      if (extension) {
        extension.slug = newSlug
      }
      return []
    }

    return []
  }

  syncExec2(sql: string, params: any[] = []): void {
    // Handle INSERT operations
    if (sql.includes("INSERT INTO")) {
      const extension = {
        id: `ext-${this.idCounter++}`,
        slug: params[1], // Assuming slug is the second parameter
        name: params[2] || "Test Extension",
        type: "script",
      }
      this.extensions.push(extension)
    }
  }

  get db() {
    return this
  }
}

describe("ExtensionTable Slug Uniqueness", () => {
  let extensionTable: ExtensionTable
  let mockDataSpace: MockDataSpace

  beforeEach(() => {
    mockDataSpace = new MockDataSpace()
    extensionTable = new ExtensionTable(mockDataSpace as any)
    extensionTable.name = "eidos__extensions"
  })

  test("slugExists should return false for non-existent slug", async () => {
    const exists = await extensionTable.slugExists("non-existent-slug")
    expect(exists).toBe(false)
  })

  test("slugExists should return true for existing slug", async () => {
    // Add an extension with a specific slug
    await extensionTable.add({
      id: "test-1",
      slug: "test-slug",
      name: "Test Extension",
    } as IExtension)

    const exists = await extensionTable.slugExists("test-slug")
    expect(exists).toBe(true)
  })

  test("generateUniqueSlug should return original slug if unique", async () => {
    const uniqueSlug = await extensionTable.generateUniqueSlug("unique-slug")
    expect(uniqueSlug).toBe("unique-slug")
  })

  test("generateUniqueSlug should append number for duplicate slug", async () => {
    // Add an extension with a specific slug
    await extensionTable.add({
      id: "test-1",
      slug: "duplicate-slug",
      name: "Test Extension 1",
    } as IExtension)

    const uniqueSlug = await extensionTable.generateUniqueSlug("duplicate-slug")
    expect(uniqueSlug).toBe("duplicate-slug-1")
  })

  test("generateUniqueSlug should increment number for multiple duplicates", async () => {
    // Add extensions with duplicate slugs
    await extensionTable.add({
      id: "test-1",
      slug: "multi-duplicate",
      name: "Test Extension 1",
    } as IExtension)

    // Manually add to mock the scenario where -1 already exists
    mockDataSpace["extensions"].push({
      id: "test-2",
      slug: "multi-duplicate-1",
      name: "Test Extension 2",
    })

    const uniqueSlug =
      await extensionTable.generateUniqueSlug("multi-duplicate")
    expect(uniqueSlug).toBe("multi-duplicate-2")
  })

  test("add method should ensure slug uniqueness", async () => {
    // Add first extension
    await extensionTable.add({
      id: "test-1",
      slug: "auto-unique",
      name: "Test Extension 1",
    } as IExtension)

    // Add second extension with same slug - should get unique slug
    await extensionTable.add({
      id: "test-2",
      slug: "auto-unique",
      name: "Test Extension 2",
    } as IExtension)

    // Verify the second extension got a unique slug
    const extension2 = await extensionTable.getExtensionBySlug("auto-unique-1")
    expect(extension2).toBeTruthy()
    expect(extension2?.name).toBe("Test Extension 2")
  })

  test("getExtensionBySlug should return correct extension", async () => {
    await extensionTable.add({
      id: "test-1",
      slug: "find-me",
      name: "Findable Extension",
    } as IExtension)

    const found = await extensionTable.getExtensionBySlug("find-me")
    expect(found).toBeTruthy()
    expect(found?.name).toBe("Findable Extension")
  })

  test("getExtensionBySlug should return null for non-existent slug", async () => {
    const notFound = await extensionTable.getExtensionBySlug("does-not-exist")
    expect(notFound).toBeNull()
  })
})
