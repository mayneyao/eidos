/**
 * User-visible latency budgets for Eidos Lite's local-first workflow.
 *
 * Keep these values centralized so source tests, real-Space probes, and
 * packaged checks measure the same contract. A budget is a regression ceiling,
 * not a target: normal warm interactions should remain comfortably below it.
 */
export const EIDOS_LITE_PERFORMANCE_BUDGET_MS = {
  packagedColdStart: 2_000,
  spaceShell: 1_000,
  explorerThousandEntries: 2_000,
  watcherTenThousandEntries: 2_000,
  nativeOpenTenMiB: 1_500,
  nativeOpenHundredMiB: 4_000,
  gridFirstPageHundredThousandRows: 2_000,
  tableOpenMillionRows: 2_000,
  tableSwitchMillionRows: 750,
  tableDeepPageMillionRows: 1_000,
  tableSearchMillionRows: 2_500,
  tableFilterMillionRows: 2_000,
  tableSortMillionRows: 2_000,
  gridCellCommitP50: 50,
  gridCellCommitP95: 150,
  tableRowMutationP95: 200,
  tableMetadataMutationMillionRows: 1_000,
  tablePhysicalSchemaMutationMillionRows: 5_000,
  tableTextSelectConversionMillionRows: 3_000,
  fieldConversionRewriteHundredThousandRows: 15_000,
  fieldConversionLossyHundredThousandRows: 20_000,
  fieldConversionRewriteMillionRows: 60_000,
  fieldConversionRejectedHundredThousandRows: 3_000,
  fieldConversionImmediateGuard: 200,
  csvAnalyzeMillionRows: 20_000,
  csvImportMillionRows: 60_000,
  csvImportTenThousandRows: 5_000,
  csvImportHundredThousandRows: 30_000,
  checkpointAcknowledgement: 2_000,
  coldLargeCheckpointAcknowledgement: 5_000,
  versionSummary: 1_000,
  selectedVersionDiff: 3_000,
  coldLargeSelectedVersionDiff: 5_000,
  spaceTree: 3_000,
  syncPreflight: 3_000,
} as const

/**
 * These are the only dependencies allowed to delay acknowledgement of the
 * corresponding local interaction. Derived status and Hosted Sync always run
 * after the durable local boundary.
 */
export const EIDOS_LITE_LOCAL_FIRST_CRITICAL_PATH = {
  openSpace: ["directory-shell"],
  openEidosFile: ["local-runtime-first-frame"],
  editCell: ["local-sqlite-mutation"],
  openTable: ["runtime-snapshot", "first-row-page"],
  switchTable: ["selected-table-row-page"],
  scrollTable: ["visible-row-pages"],
  queryTable: ["visible-row-page", "matching-row-count"],
  convertMetadataField: ["distinct-option-summary", "schema-metadata"],
  convertStoredField: ["complete-value-preflight", "atomic-table-rewrite"],
  migratePhysicalField: ["local-sqlite-schema-migration"],
  saveVersion: ["graft-stage", "graft-commit"],
  changesSummary: ["graft-status-summary"],
  versionDetails: ["selected-path-diff"],
} as const

export const EIDOS_LITE_POST_CHECKPOINT_BACKGROUND_WORK = [
  "post-commit-status",
  "account-authorization",
  "sync-queue-persistence",
  "fetch",
  "push",
] as const
