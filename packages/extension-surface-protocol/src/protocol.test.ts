import { describe, expect, it } from "vitest"
import {
  applyExtensionTextEdits,
  EXTENSION_SURFACE_MAX_CHANGED_CODE_UNITS,
  EXTENSION_SURFACE_MAX_EDITS,
  EXTENSION_SURFACE_PROTOCOL_VERSION,
  ExtensionSurfaceProtocolError,
  invertExtensionTextEdits,
  parseExtensionSurfaceMessage,
  validateExtensionTextEdits,
} from "./index"

describe("extension surface message parsing", () => {
  it("parses the fixed handshake and versioned edit requests", () => {
    expect(
      parseExtensionSurfaceMessage({
        type: "ready",
        protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION,
      })
    ).toEqual({ type: "ready", protocolVersion: 1 })
    expect(
      parseExtensionSurfaceMessage({
        type: "apply-edits",
        requestId: "request-1",
        documentId: "document-1",
        baseRevision: 7,
        edits: [{ start: 2, end: 3, text: "x" }],
      })
    ).toEqual({
      type: "apply-edits",
      requestId: "request-1",
      documentId: "document-1",
      baseRevision: 7,
      edits: [{ start: 2, end: 3, text: "x" }],
    })
    expect(parseExtensionSurfaceMessage({ type: "activated" })).toEqual({
      type: "activated",
    })
    expect(
      parseExtensionSurfaceMessage({
        type: "activation-error",
        message: "Unable to activate",
      })
    ).toEqual({ type: "activation-error", message: "Unable to activate" })
    expect(
      parseExtensionSurfaceMessage({
        type: "surface-log",
        generation: "generation-1",
        level: "warn",
        message: "Missing task title",
      })
    ).toEqual({
      type: "surface-log",
      generation: "generation-1",
      level: "warn",
      message: "Missing task title",
    })
    expect(
      parseExtensionSurfaceMessage({
        type: "base-page-request",
        requestId: "page-1",
        generation: "generation-1",
        offset: 200,
        limit: 100,
      })
    ).toEqual({
      type: "base-page-request",
      requestId: "page-1",
      generation: "generation-1",
      offset: 200,
      limit: 100,
    })
  })

  it("rejects unsupported, unbounded, and malformed surface messages", () => {
    expect(() =>
      parseExtensionSurfaceMessage({ type: "ready", protocolVersion: 2 })
    ).toThrow("unsupported")
    expect(() =>
      parseExtensionSurfaceMessage({
        type: "apply-edits",
        requestId: "request-1",
        documentId: "document-1",
        baseRevision: 0,
        edits: [{ start: 0, end: 0, text: "x" }],
      })
    ).toThrow("positive safe integer")
    expect(() => parseExtensionSurfaceMessage({ type: "open-socket" })).toThrow(
      "Unsupported surface message"
    )
    expect(() =>
      parseExtensionSurfaceMessage({ type: "activation-error", message: "" })
    ).toThrow("non-empty string")
    expect(() =>
      parseExtensionSurfaceMessage({
        type: "surface-log",
        generation: "generation-1",
        level: "trace",
        message: "hidden",
      })
    ).toThrow("Surface log level is invalid")
    expect(() =>
      parseExtensionSurfaceMessage({
        type: "surface-log",
        generation: "generation-1",
        level: "info",
        message: "x".repeat(4097),
      })
    ).toThrow("Surface log message")
    expect(() =>
      parseExtensionSurfaceMessage({
        type: "base-page-request",
        requestId: "page-1",
        generation: "generation-1",
        offset: -1,
        limit: 100,
      })
    ).toThrow("Base page offset")
    expect(() =>
      parseExtensionSurfaceMessage({
        type: "base-page-request",
        requestId: "page-1",
        generation: "generation-1",
        offset: 0,
        limit: 201,
      })
    ).toThrow("Base page limit")
  })
})

describe("versioned UTF-16 text edits", () => {
  it("applies sorted minimal edits with UTF-16 code-unit offsets", () => {
    const before = "A😀B\nsecond"
    const edits = [
      { start: 1, end: 3, text: "🙂" },
      { start: 4, end: 4, text: "!" },
    ]
    const after = applyExtensionTextEdits(before, edits)

    expect(after).toBe("A🙂B!\nsecond")
    expect(
      applyExtensionTextEdits(after, invertExtensionTextEdits(before, edits))
    ).toBe(before)
  })

  it("rejects overlapping, ambiguous, out-of-range, and excessive edits", () => {
    expect(() =>
      validateExtensionTextEdits(
        [
          { start: 0, end: 2, text: "a" },
          { start: 1, end: 3, text: "b" },
        ],
        { documentLength: 4 }
      )
    ).toThrow("sorted and non-overlapping")
    expect(() =>
      validateExtensionTextEdits(
        [
          { start: 1, end: 1, text: "a" },
          { start: 1, end: 1, text: "b" },
        ],
        { documentLength: 4 }
      )
    ).toThrow("sorted and non-overlapping")
    expect(() =>
      validateExtensionTextEdits([{ start: 0, end: 5, text: "" }], {
        documentLength: 4,
      })
    ).toThrow("exceeds the document length")
    expect(() =>
      validateExtensionTextEdits(
        Array.from({ length: EXTENSION_SURFACE_MAX_EDITS + 1 }, (_, index) => ({
          start: index,
          end: index,
          text: "x",
        }))
      )
    ).toThrow(`between 1 and ${EXTENSION_SURFACE_MAX_EDITS}`)
    expect(() =>
      validateExtensionTextEdits(
        [
          {
            start: 0,
            end: EXTENSION_SURFACE_MAX_CHANGED_CODE_UNITS + 1,
            text: "",
          },
        ],
        { documentLength: EXTENSION_SURFACE_MAX_CHANGED_CODE_UNITS + 1 }
      )
    ).toThrow(
      `change more than ${EXTENSION_SURFACE_MAX_CHANGED_CODE_UNITS} code units`
    )
  })

  it("does not allow callers to raise the fixed protocol resource limits", () => {
    expect(() =>
      validateExtensionTextEdits([{ start: 0, end: 0, text: "x" }], {
        maxEdits: EXTENSION_SURFACE_MAX_EDITS + 1,
      })
    ).toThrow("Maximum edit count")
  })

  it("reports protocol errors with a stable code", () => {
    try {
      applyExtensionTextEdits("abc", [{ start: 4, end: 4, text: "x" }])
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ExtensionSurfaceProtocolError)
      expect((error as ExtensionSurfaceProtocolError).code).toBe(
        "PROTOCOL_ERROR"
      )
    }
  })
})
