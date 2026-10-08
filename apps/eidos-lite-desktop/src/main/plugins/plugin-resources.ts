import path from "node:path"
import { PluginError, object } from "@eidos.space/plugin-runtime/rpc"
import type { ResourceSource } from "@eidos.space/plugin-sdk"
import type { PluginResourceRect } from "../../shared/plugins"
import { normalizeMutableRelativePath } from "../space/space-paths"

export function resourcePath(boundPath: string, value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 2048 ||
    /[\\\u0000-\u001f:]/u.test(value) ||
    value.startsWith("/")
  )
    throw new PluginError(
      "INVALID_REQUEST",
      "Expected a relative resource path"
    )
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(boundPath), value)
  )
  const safe = normalizeMutableRelativePath(resolved)
  if (safe === boundPath)
    throw new PluginError("INVALID_REQUEST", "A file cannot embed itself")
  return safe
}
export function resourceSource(value: unknown): ResourceSource {
  const source = object(value)
  if (
    typeof source.path !== "string" ||
    !["file", "eidos-view"].includes(String(source.kind))
  )
    throw new PluginError("INVALID_REQUEST", "Invalid resource source")
  if (source.kind === "eidos-view") {
    if (
      Object.keys(source).sort().join() !== "kind,path,tableId,viewId" ||
      typeof source.tableId !== "string" ||
      !source.tableId ||
      source.tableId.length > 128 ||
      typeof source.viewId !== "string" ||
      !source.viewId ||
      source.viewId.length > 128
    )
      throw new PluginError("INVALID_REQUEST", "Invalid saved view reference")
    return {
      kind: "eidos-view",
      path: source.path,
      tableId: source.tableId,
      viewId: source.viewId,
    }
  }
  if (
    Object.keys(source).some(
      (key) => !["kind", "path", "editor"].includes(key)
    ) ||
    (source.editor !== undefined &&
      (typeof source.editor !== "string" ||
        !source.editor ||
        source.editor.length > 256))
  )
    throw new PluginError("INVALID_REQUEST", "Invalid file reference")
  return {
    kind: "file",
    path: source.path,
    ...(source.editor === undefined ? {} : { editor: source.editor as string }),
  }
}
export function resourceRect(value: unknown): PluginResourceRect {
  const rect = object(value)
  const keys = [
    "x",
    "y",
    "width",
    "height",
    "clipTop",
    "clipRight",
    "clipBottom",
    "clipLeft",
  ] as const
  if (
    Object.keys(rect).some(
      (key) =>
        key !== "interactive" &&
        key !== "occlusions" &&
        !keys.includes(key as (typeof keys)[number])
    ) ||
    (rect.interactive !== undefined && typeof rect.interactive !== "boolean") ||
    keys.some(
      (key) =>
        typeof rect[key] !== "number" ||
        !Number.isFinite(rect[key]) ||
        Math.abs(rect[key] as number) > 100000 ||
        (key !== "x" && key !== "y" && (rect[key] as number) < 0)
    )
  )
    throw new PluginError("INVALID_REQUEST", "Invalid resource bounds")
  if (rect.occlusions !== undefined) {
    if (!Array.isArray(rect.occlusions) || rect.occlusions.length > 1)
      throw new PluginError("INVALID_REQUEST", "Invalid resource occlusions")
    for (const item of rect.occlusions) {
      const box = object(item)
      if (
        Object.keys(box).length !== 4 ||
        ["x", "y", "width", "height"].some(
          (key) =>
            typeof box[key] !== "number" ||
            !Number.isFinite(box[key]) ||
            Math.abs(box[key] as number) > 100000 ||
            ((key === "width" || key === "height") && (box[key] as number) < 0)
        )
      )
        throw new PluginError("INVALID_REQUEST", "Invalid resource occlusions")
    }
  }
  return rect as unknown as PluginResourceRect
}
