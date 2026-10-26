import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { EidosFileFilterGroupEditor } from "@eidos.space/eidos-file-ui/eidos-file-query-toolbar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
} from "@eidos.space/eidos-file-ui"
import { ChevronDown } from "lucide-react"
import { ExplorerSuffixValues } from "./explorer-filter-values"
import {
  explorerBuiltinFields,
  explorerFieldOperators,
  explorerToUIFilter,
  explorerFromUIFilter,
  EXPLORER_FIELD_PREFIX,
} from "./explorer-filter-adapter"
import {
  normalizeExplorerFileFilter,
  type ExplorerFileFilter,
} from "./explorer-file-filter"
import { useEidosLiteI18n } from "./i18n"

export function ExplorerAdvancedFilterEditor({
  suffixes = [],
  fields = [],
  filter,
  onChange,
}: {
  suffixes?: readonly string[]
  fields?: EidosFileFieldInfo[]
  filter: ExplorerFileFilter
  onChange(filter: ExplorerFileFilter): void
}) {
  const { t } = useEidosLiteI18n()
  return (
    <EidosFileFilterGroupEditor
      fields={[...explorerBuiltinFields(t), ...fields]}
      fieldGroup={(field) =>
        t(
          field.id.startsWith(EXPLORER_FIELD_PREFIX)
            ? "File properties"
            : "Extended properties"
        )
      }
      group={explorerToUIFilter(filter)}
      depth={0}
      getOperators={explorerFieldOperators}
      renderValue={(field, rule, change) => {
        if (field.id !== EXPLORER_FIELD_PREFIX + "suffix") return undefined
        const values = Array.isArray(rule.value)
          ? rule.value.filter(
              (value): value is string => typeof value === "string"
            )
          : []
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-full justify-between gap-1 px-2 text-xs"
              >
                <span className="truncate">
                  {values.join(", ") || t("Choose suffixes")}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <ExplorerSuffixValues value={values} onChange={change} />
              <div className="mt-2 flex flex-wrap gap-1">
                {suffixes.map((suffix) => (
                  <Button
                    key={suffix}
                    variant={values.includes(suffix) ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    aria-pressed={values.includes(suffix)}
                    onClick={() =>
                      change(
                        values.includes(suffix)
                          ? values.filter((value) => value !== suffix)
                          : [...values, suffix]
                      )
                    }
                  >
                    {suffix}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )
      }}
      onChange={(next) =>
        onChange(normalizeExplorerFileFilter(explorerFromUIFilter(next)))
      }
    />
  )
}
