import { resolveEditableSourceRange } from "../core/source-range"
import { analyzeEfmMarkdown } from "./efm-document"

/** Compatibility helper for EFM callers; editor behavior injects its codec. */
export function resolveEfmEditableSourceRange(
  options: Omit<Parameters<typeof resolveEditableSourceRange>[0], "analyze"> & {
    analyze?: Parameters<typeof resolveEditableSourceRange>[0]["analyze"]
  }
) {
  return resolveEditableSourceRange({
    ...options,
    analyze: options.analyze ?? analyzeEfmMarkdown,
  })
}

export type {
  EditableSourceRange as EfmEditableSourceRange,
  EditableSourceRangeResult as EfmEditableSourceRangeResult,
  SourceRangeUnavailableReason as EfmSourceRangeUnavailableReason,
} from "../core/source-range"
