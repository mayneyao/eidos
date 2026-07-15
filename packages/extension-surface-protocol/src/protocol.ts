import { EXTENSION_SURFACE_PROTOCOL_VERSION } from "./types"
import type { ExtensionSurfaceToHostMessage, ExtensionTextEdit } from "./types"

export const EXTENSION_SURFACE_MAX_EDITS = 128
export const EXTENSION_SURFACE_MAX_INSERTED_CODE_UNITS = 256 * 1024
export const EXTENSION_SURFACE_MAX_CHANGED_CODE_UNITS = 256 * 1024
export const EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS = 512 * 1024

export class ExtensionSurfaceProtocolError extends Error {
  readonly code = "PROTOCOL_ERROR" as const

  constructor(message: string) {
    super(message)
    this.name = "ExtensionSurfaceProtocolError"
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ExtensionSurfaceProtocolError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, label: string, maxLength: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength
  ) {
    throw new ExtensionSurfaceProtocolError(
      `${label} must be a non-empty string no longer than ${maxLength} characters`
    )
  }
  return value
}

function revision(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new ExtensionSurfaceProtocolError(
      `${label} must be a positive safe integer`
    )
  }
  return value as number
}

export interface ValidateExtensionTextEditsOptions {
  documentLength?: number
  maxEdits?: number
  maxInsertedCodeUnits?: number
  maxChangedCodeUnits?: number
  maxTextCodeUnits?: number
}

function nonNegativeSafeInteger(
  value: number,
  label: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ExtensionSurfaceProtocolError(
      `${label} must be a safe integer between ${minimum} and ${maximum}`
    )
  }
  return value
}

/**
 * Parse and normalize an edit batch. Offsets are UTF-16 code-unit offsets and
 * every edit is relative to the same base revision.
 */
export function validateExtensionTextEdits(
  value: unknown,
  options: ValidateExtensionTextEditsOptions = {}
): ExtensionTextEdit[] {
  const maxEdits = options.maxEdits ?? EXTENSION_SURFACE_MAX_EDITS
  const maxInsertedCodeUnits =
    options.maxInsertedCodeUnits ?? EXTENSION_SURFACE_MAX_INSERTED_CODE_UNITS
  const maxChangedCodeUnits =
    options.maxChangedCodeUnits ?? EXTENSION_SURFACE_MAX_CHANGED_CODE_UNITS
  const maxTextCodeUnits =
    options.maxTextCodeUnits ?? EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS
  const documentLength = options.documentLength
  nonNegativeSafeInteger(
    maxEdits,
    "Maximum edit count",
    1,
    EXTENSION_SURFACE_MAX_EDITS
  )
  nonNegativeSafeInteger(
    maxInsertedCodeUnits,
    "Maximum inserted code units",
    0,
    EXTENSION_SURFACE_MAX_INSERTED_CODE_UNITS
  )
  nonNegativeSafeInteger(
    maxChangedCodeUnits,
    "Maximum changed code units",
    0,
    EXTENSION_SURFACE_MAX_CHANGED_CODE_UNITS
  )
  nonNegativeSafeInteger(
    maxTextCodeUnits,
    "Maximum text code units",
    0,
    EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS
  )
  if (documentLength !== undefined) {
    nonNegativeSafeInteger(documentLength, "Document length")
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > maxEdits) {
    throw new ExtensionSurfaceProtocolError(
      `Text edits must contain between 1 and ${maxEdits} entries`
    )
  }

  let insertedCodeUnits = 0
  let removedCodeUnits = 0
  let previous: ExtensionTextEdit | undefined
  const edits = value.map((candidate, index) => {
    const input = record(candidate, `Text edit ${index}`)
    const start = input.start
    const end = input.end
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      (start as number) < 0 ||
      (end as number) < (start as number)
    ) {
      throw new ExtensionSurfaceProtocolError(
        `Text edit ${index} range is invalid`
      )
    }
    if (documentLength !== undefined && (end as number) > documentLength) {
      throw new ExtensionSurfaceProtocolError(
        `Text edit ${index} exceeds the document length`
      )
    }
    if (typeof input.text !== "string") {
      throw new ExtensionSurfaceProtocolError(
        `Text edit ${index} text must be a string`
      )
    }
    const edit: ExtensionTextEdit = {
      start: start as number,
      end: end as number,
      text: input.text,
    }
    if (
      previous &&
      (edit.start < previous.end ||
        (edit.start === previous.start && previous.start === previous.end))
    ) {
      throw new ExtensionSurfaceProtocolError(
        "Text edits must be sorted and non-overlapping"
      )
    }
    previous = edit
    insertedCodeUnits += edit.text.length
    removedCodeUnits += edit.end - edit.start
    if (insertedCodeUnits > maxInsertedCodeUnits) {
      throw new ExtensionSurfaceProtocolError(
        `Text edits insert more than ${maxInsertedCodeUnits} code units`
      )
    }
    if (insertedCodeUnits + removedCodeUnits > maxChangedCodeUnits) {
      throw new ExtensionSurfaceProtocolError(
        `Text edits change more than ${maxChangedCodeUnits} code units`
      )
    }
    return edit
  })

  if (
    documentLength !== undefined &&
    documentLength - removedCodeUnits + insertedCodeUnits > maxTextCodeUnits
  ) {
    throw new ExtensionSurfaceProtocolError(
      `Text document would exceed ${maxTextCodeUnits} code units`
    )
  }
  return edits
}

export function applyExtensionTextEdits(
  textValue: string,
  editsValue: unknown,
  options: Omit<ValidateExtensionTextEditsOptions, "documentLength"> = {}
): string {
  if (typeof textValue !== "string") {
    throw new ExtensionSurfaceProtocolError("Document text must be a string")
  }
  if (
    textValue.length >
    (options.maxTextCodeUnits ?? EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS)
  ) {
    throw new ExtensionSurfaceProtocolError(
      `Text document exceeds ${options.maxTextCodeUnits ?? EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS} code units`
    )
  }
  const edits = validateExtensionTextEdits(editsValue, {
    ...options,
    documentLength: textValue.length,
  })
  let result = textValue
  for (let index = edits.length - 1; index >= 0; index -= 1) {
    const edit = edits[index]
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`
  }
  return result
}

/** Create edits that restore `before` when applied to the edited document. */
export function invertExtensionTextEdits(
  before: string,
  editsValue: unknown
): ExtensionTextEdit[] {
  const edits = validateExtensionTextEdits(editsValue, {
    documentLength: before.length,
  })
  let delta = 0
  const inverse = edits.map((edit) => {
    const start = edit.start + delta
    const replaced = before.slice(edit.start, edit.end)
    delta += edit.text.length - (edit.end - edit.start)
    return {
      start,
      end: start + edit.text.length,
      text: replaced,
    }
  })
  const afterLength = before.length + delta
  return validateExtensionTextEdits(inverse, { documentLength: afterLength })
}

/** Parse every message crossing from an untrusted surface into the host. */
export function parseExtensionSurfaceMessage(
  value: unknown
): ExtensionSurfaceToHostMessage {
  const input = record(value, "Surface message")
  const type = text(input.type, "Surface message type", 64)
  if (type === "ready") {
    if (input.protocolVersion !== EXTENSION_SURFACE_PROTOCOL_VERSION) {
      throw new ExtensionSurfaceProtocolError(
        "Surface protocol version is unsupported"
      )
    }
    return { type, protocolVersion: EXTENSION_SURFACE_PROTOCOL_VERSION }
  }
  if (type === "closed") return { type }

  if (
    type !== "apply-edits" &&
    type !== "request-save" &&
    type !== "request-undo" &&
    type !== "request-redo" &&
    type !== "request-resync"
  ) {
    throw new ExtensionSurfaceProtocolError(
      `Unsupported surface message: ${type}`
    )
  }
  const requestId = text(input.requestId, "Surface request ID", 128)
  const documentId = text(input.documentId, "Document ID", 256)
  const baseRevision = revision(input.baseRevision, "Base revision")
  if (type === "apply-edits") {
    return {
      type,
      requestId,
      documentId,
      baseRevision,
      edits: validateExtensionTextEdits(input.edits),
    }
  }
  return { type, requestId, documentId, baseRevision }
}
