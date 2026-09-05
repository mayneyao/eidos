import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type { Transformer } from "@lexical/markdown"
import {
  DocumentSession,
  type SourceRangeCommit,
} from "../core/document-session"
import type { MarkdownProfileCodec } from "../profile-system/profile-api"

import type { CodeHighlightTokenizer } from "../highlighting/code-highlight-tokenizer"
import type {
  EfmInputProfile,
  MarkdownEditorImageUrlResolver,
  MarkdownEditorInternalLinkHandler,
} from "../types"

export const EXTERNAL_MARKDOWN_CONFLICT_MESSAGE =
  "The document changed outside the editor. Save this draft to keep it, or cancel to load the external version."

export const SOURCE_RANGE_COMMIT_TAG =
  "eidos-markdown-editor:source-range-commit"

export type EfmSourceRangeCommit = SourceRangeCommit

interface EfmSourceBlockContextValue {
  session: DocumentSession
  codec: MarkdownProfileCodec
  saveBlockLabel: string
  emptyMathBlockLabel: string
  emptyImageBlockLabel: string
  obsidianWikilinks: boolean
  readOnly: boolean
  documentKey: string
  onError(error: Error): void
  resolveImageUrl?: MarkdownEditorImageUrlResolver
  onOpenInternalLink?: MarkdownEditorInternalLinkHandler
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
}

const EfmSourceBlockContext = createContext<EfmSourceBlockContextValue>({
  get session(): DocumentSession {
    throw new Error("Document editing requires EfmSourceBlockProvider.")
  },
  get codec(): MarkdownProfileCodec {
    throw new Error("Document editing requires an explicit profile codec.")
  },
  saveBlockLabel: "Done",
  emptyMathBlockLabel: "Add a TeX equation",
  emptyImageBlockLabel: "Add an image",
  obsidianWikilinks: false,
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
})

type EfmSourceBlockProviderProps = Omit<
  EfmSourceBlockContextValue,
  | "activeDrafts"
  | "session"
  | "clearSourceRangeCommit"
  | "externalMarkdownConflict"
  | "getAcceptedMarkdown"
  | "queueSourceRangeCommit"
  | "registerDraft"
> & { children: ReactNode; markdown: string }

export function EfmSourceBlockProvider({
  codec,
  children,
  saveBlockLabel,
  emptyMathBlockLabel,
  emptyImageBlockLabel,
  obsidianWikilinks,
  readOnly,
  documentKey,
  markdown,
  onError,
  resolveImageUrl,
  onOpenInternalLink,
  baseUri,
  codeHighlightTokenizer,
  inputProfile,
  syntaxFeatures,
  transformers,
}: EfmSourceBlockProviderProps) {
  const [session] = useState(() => new DocumentSession(markdown))
  const { activeDrafts, externalMarkdownConflict } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  )
  const {
    clearSourceRangeCommit,
    getAcceptedMarkdown,
    queueSourceRangeCommit,
    registerDraft,
  } = session
  const value = useMemo(
    () => ({
      session,
      codec,
      saveBlockLabel,
      emptyMathBlockLabel,
      emptyImageBlockLabel,
      obsidianWikilinks,
      readOnly,
      documentKey,
      onError,
      resolveImageUrl,
      onOpenInternalLink,
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
    }),
    [
      session,
      codec,
      saveBlockLabel,
      emptyMathBlockLabel,
      emptyImageBlockLabel,
      obsidianWikilinks,
      readOnly,
      documentKey,
      onError,
      resolveImageUrl,
      onOpenInternalLink,
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
