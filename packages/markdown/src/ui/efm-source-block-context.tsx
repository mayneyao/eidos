import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { Transformer } from "@lexical/markdown"

import type { CodeHighlightTokenizer } from "../highlighting/code-highlight-tokenizer"
import type { EfmInputProfile, MarkdownEditorImageUrlResolver } from "../types"

export const EXTERNAL_MARKDOWN_CONFLICT_MESSAGE =
  "The document changed outside the editor. Save this draft to keep it, or cancel to load the external version."

export const SOURCE_RANGE_COMMIT_TAG =
  "eidos-markdown-editor:source-range-commit"

export interface EfmSourceRangeCommit {
  end: number
  expectedSource: string
  source: string
  start: number
}

interface EfmSourceBlockContextValue {
  saveBlockLabel: string
  emptyMathBlockLabel: string
  emptyImageBlockLabel: string
  readOnly: boolean
  documentKey: string
  onError(error: Error): void
  resolveImageUrl?: MarkdownEditorImageUrlResolver
  baseUri?: string
  codeHighlightTokenizer?: CodeHighlightTokenizer | false
  inputProfile: EfmInputProfile
  syntaxFeatures: ReadonlySet<string>
  transformers: readonly Transformer[]
  activeDrafts: number
  externalMarkdownConflict: boolean
  clearSourceRangeCommit(): void
  getAcceptedMarkdown(): string
  queueSourceRangeCommit(commit: EfmSourceRangeCommit): void
  registerDraft(): () => void
  setAcceptedMarkdown(markdown: string): void
  setExternalMarkdownConflict(value: boolean): void
  takeSourceRangeCommit(): EfmSourceRangeCommit | null
}

const EfmSourceBlockContext = createContext<EfmSourceBlockContextValue>({
  saveBlockLabel: "Done",
  emptyMathBlockLabel: "Add a TeX equation",
  emptyImageBlockLabel: "Add an image",
  readOnly: false,
  documentKey: "",
  onError: console.error,
  inputProfile: "document",
  syntaxFeatures: new Set(),
  transformers: [],
  activeDrafts: 0,
  externalMarkdownConflict: false,
  clearSourceRangeCommit: () => undefined,
  getAcceptedMarkdown: () => "",
  queueSourceRangeCommit: () => undefined,
  registerDraft: () => () => undefined,
  setAcceptedMarkdown: () => undefined,
  setExternalMarkdownConflict: () => undefined,
  takeSourceRangeCommit: () => null,
})

type EfmSourceBlockProviderProps = Omit<
  EfmSourceBlockContextValue,
  | "activeDrafts"
  | "clearSourceRangeCommit"
  | "externalMarkdownConflict"
  | "getAcceptedMarkdown"
  | "queueSourceRangeCommit"
  | "registerDraft"
  | "setAcceptedMarkdown"
  | "setExternalMarkdownConflict"
  | "takeSourceRangeCommit"
> & { children: ReactNode; markdown: string }

export function EfmSourceBlockProvider({
  children,
  saveBlockLabel,
  emptyMathBlockLabel,
  emptyImageBlockLabel,
  readOnly,
  documentKey,
  markdown,
  onError,
  resolveImageUrl,
  baseUri,
  codeHighlightTokenizer,
  inputProfile,
  syntaxFeatures,
  transformers,
}: EfmSourceBlockProviderProps) {
  const [activeDrafts, setActiveDrafts] = useState(0)
  const [externalMarkdownConflict, setExternalMarkdownConflict] =
    useState(false)
  const acceptedMarkdownRef = useRef(markdown)
  const sourceRangeCommitRef = useRef<EfmSourceRangeCommit | null>(null)
  const clearSourceRangeCommit = useCallback(() => {
    sourceRangeCommitRef.current = null
  }, [])
  const getAcceptedMarkdown = useCallback(() => acceptedMarkdownRef.current, [])
  const queueSourceRangeCommit = useCallback((commit: EfmSourceRangeCommit) => {
    sourceRangeCommitRef.current = commit
  }, [])
  const setAcceptedMarkdown = useCallback((nextMarkdown: string) => {
    acceptedMarkdownRef.current = nextMarkdown
  }, [])
  const takeSourceRangeCommit = useCallback(() => {
    const commit = sourceRangeCommitRef.current
    sourceRangeCommitRef.current = null
    return commit
  }, [])
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
      saveBlockLabel,
      emptyMathBlockLabel,
      emptyImageBlockLabel,
      readOnly,
      documentKey,
      onError,
      resolveImageUrl,
      baseUri,
      codeHighlightTokenizer,
      inputProfile,
      syntaxFeatures,
      transformers,
      activeDrafts,
      externalMarkdownConflict,
      clearSourceRangeCommit,
      getAcceptedMarkdown,
      queueSourceRangeCommit,
      registerDraft,
      setAcceptedMarkdown,
      setExternalMarkdownConflict,
      takeSourceRangeCommit,
    }),
    [
      saveBlockLabel,
      emptyMathBlockLabel,
      emptyImageBlockLabel,
      readOnly,
      documentKey,
      onError,
      resolveImageUrl,
      baseUri,
      codeHighlightTokenizer,
      inputProfile,
      syntaxFeatures,
      transformers,
      activeDrafts,
      externalMarkdownConflict,
      clearSourceRangeCommit,
      getAcceptedMarkdown,
      queueSourceRangeCommit,
      registerDraft,
      setAcceptedMarkdown,
      takeSourceRangeCommit,
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
