import {
  createEidosLiteDiagnostics,
  serializeEidosLiteDiagnostics,
} from "./diagnostics"

describe("Eidos Lite diagnostics", () => {
  it("contains support state without user paths, URLs, identifiers, or secrets", () => {
    const diagnostics = createEidosLiteDiagnostics(
      {
        app: { name: "Eidos Lite", version: "0.1.0", packaged: true },
        platform: "darwin",
        arch: "arm64",
        electronVersion: "40.8.5",
        environment: "staging",
        logs: {
          retainedFiles: 2,
          currentBytes: 1_024,
          recent: [
            {
              schemaVersion: 1,
              timestamp: "2026-07-29T00:00:00.000Z",
              sequence: 4,
              level: "error",
              source: "main",
              event: "sync.enable.failed",
              context: {
                stage: "initial-push",
                spaceKey: "1782d90391ac",
              },
              error: {
                name: "Error",
                message:
                  "HTTP failure at <service>/<namespace>/<repository>/raw/segments/<object>",
              },
            },
          ],
        },
        space: {
          eidosFileCount: 4,
          operation: { phase: "ready", recoverable: false },
          graft: {
            available: true,
            backend: "sdk",
            version: "0.3.1",
            expectedVersion: "0.3.1",
            initialized: true,
            clean: false,
          },
          residentRuntimeCount: 3,
          trackedRuntimeCount: 5,
        },
      },
      "2026-07-29T00:00:00.000Z"
    )
    const serialized = serializeEidosLiteDiagnostics(diagnostics)

    expect(diagnostics.space).toMatchObject({
      open: true,
      eidosFileCount: 4,
      operation: { phase: "ready" },
      runtime: { residentCount: 3, trackedCount: 5 },
    })
    expect(diagnostics.logs).toMatchObject({
      format: "jsonl",
      retainedFiles: 2,
      currentBytes: 1_024,
    })
    expect(diagnostics.logs.recent).toHaveLength(1)
    expect(serialized).not.toContain("/Users/")
    expect(serialized).not.toContain("https://")
    expect(serialized).not.toContain("remoteUrl")
    expect(serialized).not.toContain("spaceId")
    expect(serialized).not.toContain("accessToken")
  })
})
