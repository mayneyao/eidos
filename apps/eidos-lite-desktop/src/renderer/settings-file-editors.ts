import { viewResource } from "@eidos.space/plugin-runtime/view"
import type { PluginListing } from "../shared/plugins"

export function fileEditorSettings(
  pluginListing: PluginListing | null,
  t: (message: string) => string
) {
  const associations =
    pluginListing?.associations ?? pluginListing?.space?.associations ?? {}

  const extChoicesMap = new Map<string, { key: string; label: string }[]>()

  for (const plugin of pluginListing?.plugins ?? []) {
    for (const placement of plugin.manifest.placements ?? []) {
      if (placement.location !== "file/open" || !placement.extensions?.length)
        continue
      const view = plugin.manifest.views?.find(
        (v) =>
          v.id === placement.view &&
          (viewResource(v) === "file" || viewResource(v) === "document")
      )
      if (!view) continue
      const editorKey = `${plugin.manifest.id}/${view.id}`
      const editorLabel =
        plugin.manifest.name === view.title
          ? view.title
          : `${view.title} (${plugin.manifest.name})`

      for (const rawExt of placement.extensions) {
        const ext = (
          rawExt.startsWith(".") ? rawExt : `.${rawExt}`
        ).toLowerCase()
        if (ext === ".eidos") continue
        if (!extChoicesMap.has(ext)) {
          extChoicesMap.set(ext, [])
        }
        const list = extChoicesMap.get(ext)!
        if (!list.some((item) => item.key === editorKey)) {
          list.push({ key: editorKey, label: editorLabel })
        }
      }
    }
  }

  const mdChoices = [
    ...(extChoicesMap.get(".md") ?? []),
    ...(extChoicesMap.get(".markdown") ?? []),
  ].filter(
    (item, index, self) =>
      self.findIndex((other) => other.key === item.key) === index
  )

  const htmlChoices = [
    ...(extChoicesMap.get(".html") ?? []),
    ...(extChoicesMap.get(".htm") ?? []),
  ].filter(
    (item, index, self) =>
      self.findIndex((other) => other.key === item.key) === index
  )

  const nonBuiltinExts = [...extChoicesMap.keys()]
    .filter(
      (ext) =>
        ext !== ".md" &&
        ext !== ".markdown" &&
        ext !== ".html" &&
        ext !== ".htm"
    )
    .sort()

  const groups: {
    extensions: string[]
    label: string
    options: { key: string; label: string }[]
    selected: string
  }[] = []

  for (const ext of nonBuiltinExts) {
    const choices = extChoicesMap.get(ext)!
    const selected = associations[ext] ?? "builtin"
    const options = [
      { key: "builtin", label: t("Built-in editor") },
      ...choices,
    ]

    const existing = groups.find(
      (g) =>
        g.selected === selected &&
        g.options.length === options.length &&
        g.options.every((opt, idx) => opt.key === options[idx].key)
    )
    if (existing) {
      existing.extensions.push(ext)
      existing.label = existing.extensions.join(", ")
    } else {
      groups.push({
        extensions: [ext],
        label: ext,
        options,
        selected,
      })
    }
  }

  return {
    markdownPluginEditors: mdChoices,
    htmlPluginEditors: htmlChoices,
    fileEditorGroups: groups,
  }
}

export type FileEditorGroup = ReturnType<
  typeof fileEditorSettings
>["fileEditorGroups"][number]
