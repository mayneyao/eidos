export {
  SpaceFiles,
  SpaceFilesError,
  type ListSpaceFilesOptions,
  type SpaceBinaryFile,
  type SpaceFileChange,
  type SpaceFileEntry,
  type SpaceFileEntryKind,
  type SpaceFileWatcher,
  type SpaceFilesErrorCode,
  type SpaceTextFile,
  type WatchSpaceFilesOptions,
} from "./space-files"
export { uniqueSpaceEntryName } from "./names"
export {
  FileSpaceIndex,
  type FileSpaceBacklink,
  type FileSpaceBacklinkReference,
  type FileSpaceIndexOptions,
  type FileSpaceIndexStatus,
  type FileSpaceLinkResolution,
  type FileSpaceSearchMatch,
  type FileSpaceSearchOptions,
  type FileSpaceSearchResult,
} from "./file-index"
export {
  markdownHeadingSlug,
  parseMarkdownMetadata,
  type FileSpaceMarkdownHeading,
  type FileSpaceMarkdownMetadata,
  type FileSpaceTag,
} from "./markdown-metadata"
