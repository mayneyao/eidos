import { useId, useLayoutEffect } from "react"
import type {
  GridCell,
  ProvideEditorCallbackResult,
  ProvideEditorComponent,
} from "@glideapps/glide-data-grid"

import { useEidosFileUI } from "./context"

/** A mounted editor owns its draft; a host must not replace it while pending. */
export function useEidosFilePendingEdit(pending: boolean): void {
  const id = useId()
  const { onPendingEditChange } = useEidosFileUI()
  useLayoutEffect(() => {
    onPendingEditChange?.(id, pending)
  }, [id, onPendingEditChange, pending])
  useLayoutEffect(
    () => () => onPendingEditChange?.(id, false),
    [id, onPendingEditChange]
  )
}

type EditorProvider = NonNullable<ProvideEditorCallbackResult<GridCell>>
type EditorProps = Parameters<ProvideEditorComponent<GridCell>>[0]
// Cache the wrapper identity: changing it on each keystroke would reset Glide's editor.
const wrappers = new WeakMap<object, EditorProvider>()

export function pendingEditEditor(provider: EditorProvider): EditorProvider {
  const cached = wrappers.get(provider)
  if (cached) return cached
  const Editor = typeof provider === "object" ? provider.editor : provider
  const Wrapped = (props: EditorProps) => {
    useEidosFilePendingEdit(true)
    return <Editor {...props} />
  }
  const wrapped =
    typeof provider === "object"
      ? { ...provider, editor: Wrapped }
      : Object.assign(Wrapped, {
          disablePadding: provider.disablePadding,
          disableStyling: provider.disableStyling,
        })
  wrappers.set(provider, wrapped as EditorProvider)
  return wrapped as EditorProvider
}
