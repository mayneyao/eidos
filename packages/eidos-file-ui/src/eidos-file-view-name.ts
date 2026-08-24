import type { EidosFileViewInfo } from "@eidos.space/eidos-file"

export function nextEidosFileViewName(
  baseName: string,
  views: readonly Pick<EidosFileViewInfo, "name">[]
): string {
  const names = new Set(views.map((view) => view.name.trim().toLowerCase()))
  if (!names.has(baseName.toLowerCase())) return baseName

  let suffix = 2
  while (names.has(`${baseName} ${suffix}`.toLowerCase())) suffix += 1
  return `${baseName} ${suffix}`
}
