import { describe, expect, it } from "vitest"
import {
  analyzeExtensionManifest,
  calculateExtensionContentDigest,
  calculateExtensionPermissionHash,
  isIgnoredExtensionPackagePath,
  parseExtensionLock,
  type ExtensionManifestV1,
  type NormalizedExtensionPermissions,
} from "./index"

function manifest(
  overrides: Partial<ExtensionManifestV1> = {}
): ExtensionManifestV1 {
  return {
    manifestVersion: 1,
    publisher: "example",
    name: "task-counter",
    displayName: "Task Counter",
    version: "1.2.3",
    engines: { eidos: ">=0.34.0 <1.0.0" },
    entrypoints: { worker: "src/extension.ts" },
    contributes: {
      commands: [
        {
          id: "example.task-counter.count",
          title: "Count tasks",
        },
      ],
      menus: {
        "files/context": [{ command: "example.task-counter.count" }],
      },
    },
    permissions: {
      files: {
        read: ["notes/**/*.md", "**/*.md"],
        write: [],
      },
      network: ["https://api.example.com"],
    },
    ...overrides,
  }
}

function diagnosticCodes(text: string): string[] {
  return analyzeExtensionManifest(text, {
    packageDirectoryName: "example.task-counter",
    hostVersion: "0.34.0",
  }).diagnostics.map((diagnostic) => diagnostic.code)
}

describe("analyzeExtensionManifest", () => {
  it("accepts a valid v1 manifest and canonicalizes permissions", () => {
    const result = analyzeExtensionManifest(JSON.stringify(manifest()), {
      packageDirectoryName: "example.task-counter",
      hostVersion: "0.34.0",
    })

    expect(result.valid).toBe(true)
    expect(result.compatible).toBe(true)
    expect(result.canonicalId).toBe("example.task-counter")
    expect(result.normalizedPermissions).toEqual({
      files: {
        read: ["**/*.md", "notes/**/*.md"],
        write: [],
      },
      network: ["https://api.example.com"],
    })
    expect(result.diagnostics).toEqual([])
  })

  it("rejects non-strict JSON and duplicate keys before schema validation", () => {
    const duplicate = JSON.stringify(manifest()).replace(
      '"publisher":"example"',
      '"publisher":"example","publisher":"other"'
    )

    expect(diagnosticCodes(duplicate)).toContain("manifest-duplicate-key")
    expect(
      diagnosticCodes(`/* comment */${JSON.stringify(manifest())}`)
    ).toContain("manifest-json-syntax")
    expect(
      diagnosticCodes(`${JSON.stringify(manifest()).slice(0, -1)},}`)
    ).toContain("manifest-json-syntax")
  })

  it("enforces the schema and host-owned semantic rules", () => {
    const extra = { ...manifest(), unexpected: true }
    expect(diagnosticCodes(JSON.stringify(extra))).toContain("manifest-schema")

    expect(
      diagnosticCodes(JSON.stringify(manifest({ publisher: "eidos" })))
    ).toContain("manifest-reserved-publisher")

    const mismatched = analyzeExtensionManifest(JSON.stringify(manifest()), {
      packageDirectoryName: "example.wrong-name",
    })
    expect(mismatched.valid).toBe(false)
    expect(mismatched.diagnostics.map(({ code }) => code)).toContain(
      "manifest-directory-mismatch"
    )

    expect(
      diagnosticCodes(
        JSON.stringify(manifest({ engines: { eidos: "not semver" } }))
      )
    ).toContain("manifest-semver")
  })

  it("requires valid entrypoints and contribution references", () => {
    const noWorker = manifest({ entrypoints: { ui: "src/ui.tsx" } })
    expect(diagnosticCodes(JSON.stringify(noWorker))).toContain(
      "manifest-entrypoint-required"
    )

    const invalidEntrypoint = manifest({
      entrypoints: { worker: "../outside.ts" },
    })
    expect(diagnosticCodes(JSON.stringify(invalidEntrypoint))).toContain(
      "manifest-schema"
    )

    const missingCommand = manifest({
      contributes: {
        commands: [{ id: "example.task-counter.count", title: "Count" }],
        menus: {
          "files/context": [{ command: "example.task-counter.missing" }],
        },
      },
    })
    expect(diagnosticCodes(JSON.stringify(missingCommand))).toContain(
      "manifest-command-missing"
    )

    const wrongNamespace = manifest({
      contributes: {
        commands: [{ id: "other.task-counter.count", title: "Count" }],
      },
    })
    expect(diagnosticCodes(JSON.stringify(wrongNamespace))).toContain(
      "manifest-id-namespace"
    )
  })

  it("rejects non-portable file permissions and non-canonical origins", () => {
    const result = analyzeExtensionManifest(
      JSON.stringify(
        manifest({
          permissions: {
            files: { read: ["../outside.md"], write: ["/absolute.md"] },
            network: ["https://user@api.example.com"],
          },
        })
      ),
      { packageDirectoryName: "example.task-counter" }
    )

    expect(result.valid).toBe(false)
    expect(
      result.diagnostics.filter(
        ({ code }) => code === "manifest-permission-invalid"
      )
    ).toHaveLength(3)
  })

  it("keeps host incompatibility distinct from manifest invalidity", () => {
    const result = analyzeExtensionManifest(JSON.stringify(manifest()), {
      packageDirectoryName: "example.task-counter",
      hostVersion: "1.2.0",
    })

    expect(result.valid).toBe(true)
    expect(result.compatible).toBe(false)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "manifest-incompatible",
        severity: "warning",
      })
    )
  })
})

describe("trust digests", () => {
  it("uses the frozen byte-level content digest and excludes the host lock", () => {
    const records = [
      { path: "src/extension.ts", content: Buffer.from("export {}\n") },
      { path: "README.md", content: Buffer.from("hello\n") },
      {
        path: "extension.lock.json",
        content: Buffer.from("this host-owned file is excluded"),
      },
    ]

    expect(calculateExtensionContentDigest(records)).toBe(
      "sha256:c714ba2cb47f282ff4776c3a820c8a9010ff21fcceb61347c3c4fb59fdf4dcba"
    )
    expect(calculateExtensionContentDigest([...records].reverse())).toBe(
      calculateExtensionContentDigest(records)
    )
  })

  it("rejects portable-path collisions before hashing", () => {
    expect(() =>
      calculateExtensionContentDigest([
        { path: "Résumé.md", content: Buffer.from("one") },
        { path: "Re\u0301sume\u0301.md", content: Buffer.from("two") },
      ])
    ).toThrow(/path collision/i)
  })

  it("excludes only canonical local development artifacts", () => {
    const source = [
      { path: "extension.json", content: Buffer.from("{}\n") },
      { path: "package.json", content: Buffer.from('{"private":true}\n') },
      { path: "src/extension.ts", content: Buffer.from("export {}\n") },
    ]
    const withArtifacts = [
      ...source,
      { path: ".git/config", content: Buffer.from("local git metadata") },
      {
        path: "node_modules/dependency/index.js",
        content: Buffer.from("generated dependency"),
      },
      { path: "dist/extension.js", content: Buffer.from("generated bundle") },
      { path: "coverage/index.html", content: Buffer.from("test output") },
    ]

    expect(calculateExtensionContentDigest(withArtifacts)).toBe(
      calculateExtensionContentDigest(source)
    )
    expect(isIgnoredExtensionPackagePath("node_modules/pkg/index.js")).toBe(
      true
    )
    expect(isIgnoredExtensionPackagePath("src/node_modules/source.ts")).toBe(
      false
    )
    expect(isIgnoredExtensionPackagePath("package.json")).toBe(false)
    expect(isIgnoredExtensionPackagePath("pnpm-lock.yaml")).toBe(false)
  })

  it("hashes normalized permissions independently of declaration order", () => {
    const left: NormalizedExtensionPermissions = {
      files: { read: ["**/*.md", "notes/**"], write: ["out/**"] },
      network: ["https://api.example.com", "https://cdn.example.com"],
    }
    const right: NormalizedExtensionPermissions = {
      files: { read: ["**/*.md", "notes/**"], write: ["out/**"] },
      network: ["https://api.example.com", "https://cdn.example.com"],
    }

    expect(calculateExtensionPermissionHash(left)).toBe(
      calculateExtensionPermissionHash(right)
    )
  })
})

describe("parseExtensionLock", () => {
  it("accepts only the host-owned GitHub lock contract", () => {
    const validLock = {
      lockVersion: 1,
      source: {
        kind: "github",
        repository: "https://github.com/example/task-counter",
        requested: "v1.2.3",
        commit: "a".repeat(40),
      },
      contentDigest: `sha256:${"b".repeat(64)}`,
    }

    expect(parseExtensionLock(JSON.stringify(validLock))).toEqual({
      lock: validLock,
      diagnostics: [],
    })
    const monorepoLock = {
      ...validLock,
      source: {
        ...validLock.source,
        subdirectory: "packages/task-counter",
      },
    }
    expect(parseExtensionLock(JSON.stringify(monorepoLock))).toEqual({
      lock: monorepoLock,
      diagnostics: [],
    })
    expect(
      parseExtensionLock(
        JSON.stringify({
          ...validLock,
          source: {
            ...validLock.source,
            repository: "https://github.com/example/task-counter/",
          },
        })
      ).diagnostics
    ).toContainEqual(expect.objectContaining({ code: "package-lock-invalid" }))
    expect(
      parseExtensionLock(
        JSON.stringify({
          ...validLock,
          source: { ...validLock.source, subdirectory: "../task-counter" },
        })
      ).diagnostics
    ).toContainEqual(expect.objectContaining({ code: "package-lock-invalid" }))
  })
})
