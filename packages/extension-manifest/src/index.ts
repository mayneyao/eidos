export {
  calculateExtensionContentDigest,
  calculateExtensionPermissionHash,
  canonicalExtensionPackagePath,
  canonicalExtensionPermissionsJson,
  EXTENSION_IGNORED_ROOT_PATHS,
  EXTENSION_LOCK_FILENAME,
  extensionPackagePathCollisionKey,
  isIgnoredExtensionPackagePath,
  type ExtensionPackageContentRecord,
} from "./digest"
export {
  analyzeExtensionManifest,
  DEFAULT_MAX_MANIFEST_BYTES,
  DEFAULT_MAX_MANIFEST_DEPTH,
  extensionCanonicalId,
  isPortableExtensionEntrypoint,
  manifestSchema,
  RESERVED_EXTENSION_PUBLISHERS,
} from "./manifest"
export { parseExtensionLock } from "./lock"
export {
  analyzeLegacyExtensionPortingReceipt,
  DEFAULT_MAX_PORTING_RECEIPT_BYTES,
  DEFAULT_MAX_PORTING_RECEIPT_DEPTH,
  LEGACY_EXTENSION_PORTING_RECEIPT_FILENAME,
  type AnalyzeLegacyExtensionPortingReceiptOptions,
  type LegacyExtensionPortingContribution,
  type LegacyExtensionPortingReceiptAnalysis,
  type LegacyExtensionPortingReceiptDiagnostic,
  type LegacyExtensionPortingReceiptDiagnosticCode,
  type LegacyExtensionPortingReceiptV1,
} from "./porting"
export {
  calculateLegacyExtensionArchiveDigest,
  type LegacyExtensionArchiveDigestRecord,
} from "./legacy-archive"
export {
  createExtensionCommandTemplate,
  createExtensionBaseViewTemplate,
  createExtensionPanelTemplate,
  createExtensionTextEditorTemplate,
} from "./template"
export type {
  AnalyzeExtensionManifestOptions,
  DiscoverExtensionPackagesOptions,
  ExtensionCommandContribution,
  ExtensionBaseViewContribution,
  ExtensionDiagnostic,
  ExtensionDiagnosticCode,
  ExtensionDiagnosticSeverity,
  ExtensionFileEditorContribution,
  ExtensionFileEditorSelector,
  ExtensionLockV1,
  ExtensionManifestAnalysis,
  ExtensionManifestV1,
  ExtensionMenuContribution,
  ExtensionPanelContribution,
  ExtensionPackageDiscovery,
  ExtensionPackageFile,
  ExtensionPackageInspection,
  ExtensionPackageInspectionStatus,
  ExtensionPermissions,
  InspectExtensionPackageOptions,
  NormalizedExtensionPermissions,
} from "./types"
export type {
  ExtensionCommandTemplateOptions,
  ExtensionBaseViewTemplateOptions,
  ExtensionPanelTemplateOptions,
  ExtensionTextEditorTemplateOptions,
  ExtensionTemplate,
  ExtensionTemplateFile,
} from "./template"
