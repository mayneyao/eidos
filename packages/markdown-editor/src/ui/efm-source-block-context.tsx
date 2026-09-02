import { createContext, useContext, useMemo, type ReactNode } from "react"

import type { MarkdownEditorImageUrlResolver } from "../types"

interface EfmSourceBlockContextValue {
  editBlockLabel: string
  saveBlockLabel: string
  cancelBlockEditLabel: string
  imageUrlLabel: string
  imageAltLabel: string
  emptyMathBlockLabel: string
  emptyImageBlockLabel: string
  readOnly: boolean
  documentKey: string
  onError(error: Error): void
  resolveImageUrl?: MarkdownEditorImageUrlResolver
  baseUri?: string
}

const EfmSourceBlockContext = createContext<EfmSourceBlockContextValue>({
  editBlockLabel: "Edit block",
  saveBlockLabel: "Done",
  cancelBlockEditLabel: "Cancel",
  imageUrlLabel: "Image URL",
  imageAltLabel: "Description",
  emptyMathBlockLabel: "Add a TeX equation",
  emptyImageBlockLabel: "Add an image",
  readOnly: false,
  documentKey: "",
  onError: console.error,
})

export function EfmSourceBlockProvider({
  children,
  editBlockLabel,
  saveBlockLabel,
  cancelBlockEditLabel,
  imageUrlLabel,
  imageAltLabel,
  emptyMathBlockLabel,
  emptyImageBlockLabel,
  readOnly,
  documentKey,
  onError,
  resolveImageUrl,
  baseUri,
}: EfmSourceBlockContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      editBlockLabel,
      saveBlockLabel,
      cancelBlockEditLabel,
      imageUrlLabel,
      imageAltLabel,
      emptyMathBlockLabel,
      emptyImageBlockLabel,
      readOnly,
      documentKey,
      onError,
      resolveImageUrl,
      baseUri,
    }),
    [
      editBlockLabel,
      saveBlockLabel,
      cancelBlockEditLabel,
      imageUrlLabel,
      imageAltLabel,
      emptyMathBlockLabel,
      emptyImageBlockLabel,
      readOnly,
      documentKey,
      onError,
      resolveImageUrl,
      baseUri,
    ]
  )
  return (
    <EfmSourceBlockContext.Provider value={value}>
      {children}
    </EfmSourceBlockContext.Provider>
  )
}

export function useEfmSourceBlockContext(): EfmSourceBlockContextValue {
  return useContext(EfmSourceBlockContext)
}
