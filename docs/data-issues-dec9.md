# Data issues investigation (Dec 9)

## Folder rename with "/" rewrites parent_id
- Symptom: renaming a folder to include a slash (e.g., `2/xxx`) updates `parent_id` to `2`, effectively moving the node.
- Likely cause: virtual FS rename splits the target path by `/`, treating parts as parent segments. See `packages/core/sqlite/virtual-fs-adapter.ts` (renameNode) where `pathParts` are derived from `newPath.replace(...).split("/")` and `parentPart !== node.parent_id` triggers a `parent_id` update.
- Suggested direction: sanitize disallowed path characters before rename, or escape literal `/` in names; alternatively, validate `newPath` against known node IDs and reject multi-part paths when the intent is a rename only.

## Table row deletion lacks child-doc warning
- Current delete confirmation in `apps/web-app/components/table/views/grid/grid-context-menu.tsx` uses generic copy and does not mention that linked child docs will be removed.
- Need to confirm whether deletion cascades to child docs in SQLite layer; if so, update UX copy (and possibly require an extra confirmation) to surface the impact.

## Files page context menu missing mount/unmount
- File context menu (`apps/web-app/components/file-tree/context-menu/file-context-menu.tsx`) offers open/rename/delete and handler actions, but no mount/unmount options as requested.
- Pending questions: which API triggers mount/unmount, and whether it applies to both files and folders. Add actions once the APIs are identified.

## Open questions
- Should folder names simply disallow `/`, or should we support escaping and keep flat parent updates only when explicit?
- For table deletes, do we need to warn about other side effects (backlinks, references)?
- What is the desired location and wording for mount/unmount in the files tree (top-level items vs. submenu)?
