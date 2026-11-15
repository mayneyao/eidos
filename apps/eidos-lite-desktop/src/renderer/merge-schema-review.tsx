import { useState } from "react"
import { Check } from "lucide-react"
import type {
  EidosSyncMergeSchemaChoice,
  EidosSyncMergeSchemaPlan,
  EidosSyncMergeSqlitePreview,
} from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

/** Field identity and supported choices are supplied by the canonical Runtime. */
export function MergeSchemaReview({
  plan,
  preview,
  ready,
  showBase,
  disabled,
  onResolve,
  onResolvePath,
}: {
  plan: EidosSyncMergeSchemaPlan
  preview: EidosSyncMergeSqlitePreview | undefined
  ready: boolean
  showBase: boolean
  disabled: boolean
  onResolve(choices: EidosSyncMergeSchemaChoice[]): void
  onResolvePath(side: "ours" | "theirs"): void
}) {
  const { t } = useEidosLiteI18n()
  const [choices, setChoices] = useState<Record<string, "ours" | "theirs">>({})
  const required = plan.fields.filter((field) => field.conflicted)
  const complete = required.every((field) => choices[field.fieldId])
  const tableIds = [...new Set(plan.fields.map((field) => field.tableId))]
  return (
    <section className="merge-schema-review" data-merge-schema-review>
      <header>
        <strong>{t("Resolve table structure")}</strong>
        <p>
          {t(
            "Choose column names first. Compare record changes in the next step."
          )}
        </p>
      </header>
      {tableIds.map((id) => {
        const table = preview?.tables.find((item) => item.id === id)
        const changes = plan.fields.filter((field) => field.tableId === id)
        const columns = table
          ? [
              ...table.fields,
              ...changes
                .filter(
                  (change) =>
                    !table.fields.some((field) => field.id === change.fieldId)
                )
                .map((change) => ({
                  id: change.fieldId,
                  name: change.oursName,
                  type: change.type,
                })),
            ]
          : []
        return (
          <section className="merge-schema-table" key={id}>
            <header>
              <strong>{changes[0]!.tableName}</strong>
            </header>
            {table ? (
              <div className="merge-schema-scroll">
                <table aria-label={t("Table structure choices")}>
                  <thead>
                    <tr>
                      {columns.map((field) => {
                        const change = changes.find(
                          (item) => item.fieldId === field.id
                        )
                        return (
                          <th
                            key={field.id}
                            scope="col"
                            data-schema-column-changed={
                              Boolean(change) || undefined
                            }
                          >
                            {change ? (
                              <>
                                {showBase ? (
                                  <small>
                                    {t("Base")}: {change.baseName}
                                  </small>
                                ) : null}
                                {change.conflicted ? (
                                  <div className="merge-schema-column-choices">
                                    {(["ours", "theirs"] as const).map(
                                      (side) => {
                                        const name =
                                          side === "ours"
                                            ? change.oursName
                                            : change.theirsName
                                        return (
                                          <button
                                            type="button"
                                            key={side}
                                            disabled={disabled}
                                            aria-label={`${t(side === "ours" ? "Use Local" : "Use Incoming")} ${name}`}
                                            aria-pressed={
                                              choices[field.id] === side
                                            }
                                            onClick={() =>
                                              setChoices((current) => ({
                                                ...current,
                                                [field.id]: side,
                                              }))
                                            }
                                          >
                                            <small>
                                              {t(
                                                side === "ours"
                                                  ? "Local"
                                                  : "Incoming"
                                              )}
                                            </small>
                                            <span>
                                              {choices[field.id] === side ? (
                                                <Check aria-hidden="true" />
                                              ) : null}
                                              {name}
                                            </span>
                                          </button>
                                        )
                                      }
                                    )}
                                  </div>
                                ) : (
                                  <span>{change.mergedName}</span>
                                )}
                              </>
                            ) : (
                              <span>{field.name}</span>
                            )}
                            <small>{field.type}</small>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row) => (
                      <tr key={row.id}>
                        {columns.map((field) => {
                          const index = table.fields.findIndex(
                            (item) => item.id === field.id
                          )
                          return (
                            <td key={field.id}>
                              {index < 0
                                ? t("Preview unavailable")
                                : row.cells[index] || "—"}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p role="status">{t("Loading table preview…")}</p>
            )}
            <p className="merge-structure-table-note">
              {t("Local record preview · record conflicts are resolved next")}
            </p>
          </section>
        )
      })}
      <footer>
        <button
          type="button"
          className="primary-action"
          disabled={disabled || !ready || !complete}
          onClick={() =>
            onResolve(
              required.map((field) => ({
                fieldId: field.fieldId,
                result: choices[field.fieldId]!,
              }))
            )
          }
        >
          {t("Apply structure and compare records")}
        </button>
      </footer>
      <details className="merge-file-options">
        <summary>{t("Whole file options")}</summary>
        <p>
          {t("Your choice keeps all tables, data and Views from that version.")}
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolvePath("ours")}
        >
          {t("Use Local File")}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolvePath("theirs")}
        >
          {t("Use Incoming File")}
        </button>
      </details>
    </section>
  )
}
