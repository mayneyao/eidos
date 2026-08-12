const MERGE_STATE_TOKEN_LENGTH_MAX = 256

/**
 * Treat Graft state tokens as bounded opaque CAS values. Their representation
 * belongs to Graft and is intentionally not the same contract as an object ID.
 */
export function requiredMergeStateToken(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MERGE_STATE_TOKEN_LENGTH_MAX ||
    value.trim() !== value
  ) {
    throw new Error("Invalid merge state token")
  }
  return value
}
