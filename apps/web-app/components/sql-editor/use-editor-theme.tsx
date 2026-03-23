import { tags as t } from "@lezer/highlight"
import { createTheme } from "@uiw/codemirror-themes"
import { useTheme } from "@/components/theme-provider"
import { useMemo } from "react"

export default function useCodeEditorTheme({
  fontSize = 0.875,
}: {
  fontSize?: number
}) {
  const { resolvedTheme, forcedTheme } = useTheme()

  return useMemo(() => {
    const isLight = (forcedTheme ?? resolvedTheme) === "light"
    return createTheme({
      theme: isLight ? "light" : "dark",
      settings: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        caret: "var(--primary)",
        selection: "color-mix(in srgb, var(--primary), transparent 80%)",
        selectionMatch: "color-mix(in srgb, var(--primary), transparent 80%)",
        gutterBackground: "var(--background)",
        gutterForeground: "var(--muted-foreground)",
        gutterBorder: "var(--border)",
        lineHighlight:
          "color-mix(in srgb, var(--muted-foreground), transparent 88%)",
        fontSize: fontSize + "rem",
        fontFamily:
          'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace',
      },
      styles: [
        {
          tag: [t.meta, t.comment],
          color: "var(--token-comment-color)",
        },
        {
          tag: [t.keyword, t.strong, t.standard(t.name)],
          color: "var(--color-primary, var(--primary))",
        },
        { tag: [t.number], color: "var(--chart-1)" },
        { tag: [t.string], color: "var(--chart-2)" },
        { tag: [t.variableName], color: "var(--token-variable-color)" },
        { tag: [t.escape], color: "var(--token-operator-color)" },
        { tag: [t.tagName], color: "var(--token-attr-color)" },
        { tag: [t.heading], color: "var(--primary)" },
        { tag: [t.quote], color: "var(--foreground)" },
        { tag: [t.list], color: "var(--token-property-color)" },
        { tag: [t.documentMeta], color: "var(--muted-foreground)" },
        {
          tag: [t.function(t.variableName)],
          color: "var(--token-function-color)",
        },
        {
          tag: [t.definition(t.typeName), t.typeName],
          color: "var(--token-selector-color)",
        },
      ],
    })
  }, [resolvedTheme, forcedTheme, fontSize])
}
