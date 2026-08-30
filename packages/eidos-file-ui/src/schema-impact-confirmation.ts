import type { SchemaPreflightResult } from "@eidos.space/eidos-file"

export type EidosFileSchemaImpact = Pick<
  SchemaPreflightResult,
  | "classification"
  | "affectedRows"
  | "dependencyCount"
  | "warnings"
  | "warningsTruncated"
  | "valueChanges"
  | "valueChangesTruncated"
>

export class EidosFileSchemaImpactRequiredError extends Error {
  readonly code = "schema-impact-confirmation-required"

  static [Symbol.hasInstance](value: unknown): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false
    }
    const candidate = value as Record<string, unknown>
    const impact = candidate.impact
    return (
      candidate.code === "schema-impact-confirmation-required" &&
      typeof impact === "object" &&
      impact !== null &&
      !Array.isArray(impact) &&
      typeof (impact as Record<string, unknown>).classification === "string" &&
      typeof (impact as Record<string, unknown>).affectedRows === "string" &&
      typeof (impact as Record<string, unknown>).dependencyCount === "string"
    )
  }

  constructor(readonly impact: EidosFileSchemaImpact) {
    super("Review the schema change impact before applying it")
    this.name = "EidosFileSchemaImpactRequiredError"
  }
}
