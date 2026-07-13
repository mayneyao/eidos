export {
  SpaceFiles,
  SpaceFilesError,
  SPACE_FILE_PREVIEW_MAX_BYTES,
  type ListSpaceFilesOptions,
  type SpaceBinaryFile,
  type SpaceFileChange,
  type SpaceFileEntry,
  type SpaceFileEntryKind,
  type SpaceFilePreview,
  type SpaceFileWatcher,
  type SpaceFilesErrorCode,
  type SpaceTextPreviewEncoding,
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
  FILE_SPACE_INDEX_FORMAT_VERSION,
  type FileSpaceIndexRecord,
  type FileSpaceIndexSnapshot,
  type FileSpaceIndexStorage,
} from "./index-storage"
export {
  markdownHeadingSlug,
  parseMarkdownMetadata,
  type FileSpaceMarkdownHeading,
  type FileSpaceMarkdownMetadata,
  type FileSpaceTag,
} from "./markdown-metadata"
