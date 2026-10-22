/** Feature IDs are a versioned contract with the account service. */
export const SPARK_FEATURES = ["file-metadata"] as const
export const SPARK_ACTIVATION_REQUIRED =
  "Activate Spark in Settings → Account & Services to use this feature. Existing files remain available."
export type SparkFeature = (typeof SPARK_FEATURES)[number]
export interface SparkStatus {
  state: "active" | "inactive" | "expired" | "unavailable"
  source: "online" | "offline" | "none"
  features: SparkFeature[]
  expiresAt?: string
  perpetualOffline?: boolean
  licenseId?: number
  error?: string
  licenses: {
    id: number
    status: string
    activation_count: number
    max_activations: number
    acquired_at?: string
    acquisition_source?: "code" | "legacy_gift"
  }[]
}
export function hasSparkFeature(
  status: SparkStatus,
  feature: SparkFeature
): boolean {
  return status.state === "active" && status.features.includes(feature)
}
