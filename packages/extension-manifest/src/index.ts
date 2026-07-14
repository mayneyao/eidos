export {
  calculateExtensionContentDigest,
  calculateExtensionPermissionHash,
  canonicalExtensionPackagePath,
  canonicalExtensionPermissionsJson,
  EXTENSION_LOCK_FILENAME,
  extensionPackagePathCollisionKey,
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
export { createExtensionCommandTemplate } from "./template"
export type {
  AnalyzeExtensionManifestOptions,
  DiscoverExtensionPackagesOptions,
  ExtensionCommandContribution,
  ExtensionDiagnostic,
  ExtensionDiagnosticCode,
  ExtensionDiagnosticSeverity,
  ExtensionFileEditorContribution,
  ExtensionFileEditorSelector,
  ExtensionLockV1,
  ExtensionManifestAnalysis,
  ExtensionManifestV1,
  ExtensionMenuContribution,
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
  ExtensionTemplate,
  ExtensionTemplateFile,
} from "./template"
