export {
  applyExtensionTextEdits,
  EXTENSION_SURFACE_MAX_CHANGED_CODE_UNITS,
  EXTENSION_SURFACE_MAX_BASE_PAGE_SIZE,
  EXTENSION_SURFACE_MAX_EDITS,
  EXTENSION_SURFACE_MAX_INSERTED_CODE_UNITS,
  EXTENSION_SURFACE_MAX_TEXT_CODE_UNITS,
  invertExtensionTextEdits,
  parseExtensionSurfaceMessage,
  validateExtensionTextEdits,
  ExtensionSurfaceProtocolError,
} from "./protocol"
export {
  ExtensionTextDocumentError,
  ExtensionTextDocumentModel,
  type ExtensionTextDocumentModelOptions,
} from "./text-document"
export * from "./types"
