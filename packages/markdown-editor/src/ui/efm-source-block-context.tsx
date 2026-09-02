import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import type { MarkdownEditorImageUrlResolver } from "../types"

export const EXTERNAL_MARKDOWN_CONFLICT_MESSAGE =
  "The document changed outside the editor. Save this draft to keep it, or cancel to load the external version."

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
  activeDrafts: number
  externalMarkdownConflict: boolean
  registerDraft(): () => void
  setExternalMarkdownConflict(value: boolean): void
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
  activeDrafts: 0,
  externalMarkdownConflict: false,
  registerDraft: () => () => undefined,
  setExternalMarkdownConflict: () => undefined,
})

type EfmSourceBlockProviderProps = Omit<
  EfmSourceBlockContextValue,
  | "activeDrafts"
  | "externalMarkdownConflict"
  | "registerDraft"
  | "setExternalMarkdownConflict"
> & { children: ReactNode }

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
}: EfmSourceBlockProviderProps) {
  const [activeDrafts, setActiveDrafts] = useState(0)
  const [externalMarkdownConflict, setExternalMarkdownConflict] =
    useState(false)
  const registerDraft = useCallback(() => {
    let registered = true
    setActiveDrafts((count) => count + 1)
    return () => {
      if (!registered) return
      registered = false
      setActiveDrafts((count) => Math.max(0, count - 1))
    }
  }, [])
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
      activeDrafts,
      externalMarkdownConflict,
      registerDraft,
      setExternalMarkdownConflict,
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
      activeDrafts,
      externalMarkdownConflict,
      registerDraft,
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
