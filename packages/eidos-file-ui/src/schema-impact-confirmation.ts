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

  constructor(readonly impact: EidosFileSchemaImpact) {
    super("Review the schema change impact before applying it")
    this.name = "EidosFileSchemaImpactRequiredError"
  }
}
