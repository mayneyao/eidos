import { Fragment, type ReactNode } from "react"
import {
  ClipboardCopy,
  Copy,
  Database,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Info,
  Pencil,
  SquareTerminal,
  Trash2,
} from "lucide-react"
import type {
  EidosLiteMarkdownEditingMode,
  EidosLitePathClipboardMode,
  SpaceTreeEntry,
} from "../shared/contracts"
import { fileManagerMessage } from "../shared/platform-copy"
import { explorerPasteTarget } from "./explorer-clipboard"
import { ExplorerClipboardMenu } from "./explorer-clipboard-menu"
import { useEidosLiteI18n } from "./i18n"
import { SpaceEntryOpenActions } from "./space-entry-open-menu"
import {
  TreeExpansionMenu,
  type TreeExpansionActions,
} from "./tree-expansion-menu"
import type { ExplorerClipboardActions } from "./use-explorer-clipboard"

export type ExplorerCreateAction = "create-file" | "create-folder"

function MenuGroups({ groups }: { groups: ReactNode[] }) {
  return (
    <>
      {groups.filter(Boolean).map((group, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <div role="separator" className="space-context-menu-separator" />
          )}
          {group}
        </Fragment>
      ))}
    </>
  )
}

function CreateItems({
  disabled,
  onCreate,
}: {
  disabled: boolean
  onCreate(action: ExplorerCreateAction): void
}) {
  const { t } = useEidosLiteI18n()
  return (
    <>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => onCreate("create-file")}
      >
        <FilePlus2 /> {t("New File")}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={() => onCreate("create-folder")}
      >
        <FolderPlus /> {t("New folder")}
      </button>
    </>
  )
}

export function ExplorerEntryContextMenuItems({
  entry,
  entries,
  platform,
  macos,
  disabled,
  navigationDisabled,
  clipboard,
  expansionActions,
  selectedEditor,
  editingModeShortcut,
  publishAction,
  actions,
  onClose,
}: {
  entry: SpaceTreeEntry
  entries: SpaceTreeEntry[]
  platform: string
  macos: boolean
  disabled: boolean
  navigationDisabled: boolean
  clipboard: ExplorerClipboardActions
  expansionActions?: TreeExpansionActions
  selectedEditor: string
  editingModeShortcut: string
  publishAction?: ReactNode
  actions: {
    open(mode?: EidosLiteMarkdownEditingMode | "preview"): void
    selectPluginEditor(editor: string): void
    create(action: ExplorerCreateAction): void
    rename(): void
    showFolder(): void
    manageFiles(): void
    properties(): void
    reveal(): void
    copyPath(mode: EidosLitePathClipboardMode): void
    trash(): void
  }
  onClose(): void
}) {
  const { t } = useEidosLiteI18n()
  const single = entries.length === 1
  const folder = single && entry.kind === "directory"
  const run = (action: () => void) => {
    action()
    onClose()
  }
  const clipboardItems = (
    <ExplorerClipboardMenu
      macos={macos}
      canCapture={!disabled && clipboard.canCapture(entries)}
      canPaste={
        !disabled && clipboard.canPaste(explorerPasteTarget(entry, null))
      }
      onCommand={(command) =>
        run(() => {
          if (command === "paste")
            void clipboard.paste(explorerPasteTarget(entry, null))
          else void clipboard.capture(command, entries)
        })
      }
    />
  )
  return (
    <>
      {!single && (
        <p className="space-context-menu-selection">
          {t("{count} items selected", { count: entries.length })}
        </p>
      )}
      <MenuGroups
        groups={[
          single &&
            (folder ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  disabled={navigationDisabled}
                  onClick={() => run(actions.showFolder)}
                >
                  <FolderOpen /> {t("Show this folder")}
                </button>
                {expansionActions && (
                  <TreeExpansionMenu
                    actions={expansionActions}
                    disabled={navigationDisabled}
                    onClose={onClose}
                  />
                )}
              </>
            ) : (
              <SpaceEntryOpenActions
                key={entry.relativePath}
                entry={entry}
                disabled={navigationDisabled}
                selectedEditor={selectedEditor}
                editingModeShortcut={editingModeShortcut}
                onOpen={(mode) => run(() => actions.open(mode))}
                onSelectPluginEditor={(editor) =>
                  run(() => actions.selectPluginEditor(editor))
                }
              />
            )),
          folder && (
            <CreateItems
              disabled={disabled}
              onCreate={(action) => run(() => actions.create(action))}
            />
          ),
          <>
            {clipboardItems}
            {single && (
              <button
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => run(actions.rename)}
              >
                <Pencil /> {t("Rename")}
              </button>
            )}
          </>,
          !single && expansionActions && (
            <TreeExpansionMenu
              actions={expansionActions}
              disabled={navigationDisabled}
              onClose={onClose}
            />
          ),
          single && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => run(actions.reveal)}
              >
                <FolderOpen /> {t(fileManagerMessage(platform))}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => run(() => actions.copyPath("relative"))}
              >
                <ClipboardCopy /> {t("Copy Relative Path")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => run(() => actions.copyPath("absolute"))}
              >
                <Copy /> {t("Copy Path")}
              </button>
              {folder ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={navigationDisabled}
                  onClick={() => run(actions.manageFiles)}
                >
                  <Database /> {t("Manage files")}
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => run(actions.properties)}
                >
                  <Info /> {t("File properties")}
                </button>
              )}
            </>
          ),
          single && publishAction,
          <button
            type="button"
            role="menuitem"
            className="danger-menu-item"
            disabled={disabled}
            onClick={() => run(actions.trash)}
          >
            <Trash2 /> {t("Move to Trash")}
          </button>,
        ]}
      />
    </>
  )
}

export function ExplorerRootContextMenuItems({
  platform,
  macos,
  disabled,
  navigationDisabled,
  clipboard,
  terminalOpen,
  onCreate,
  onManageFiles,
  onToggleTerminal,
  onReveal,
  onClose,
}: {
  platform: string
  macos: boolean
  disabled: boolean
  navigationDisabled: boolean
  clipboard: ExplorerClipboardActions
  terminalOpen: boolean
  onCreate(action: ExplorerCreateAction): void
  onManageFiles(): void
  onToggleTerminal?(): void
  onReveal(): void
  onClose(): void
}) {
  const { t } = useEidosLiteI18n()
  const run = (action: () => void) => {
    action()
    onClose()
  }
  return (
    <MenuGroups
      groups={[
        <CreateItems
          disabled={disabled}
          onCreate={(action) => run(() => onCreate(action))}
        />,
        <ExplorerClipboardMenu
          macos={macos}
          canCapture={false}
          canPaste={!disabled && clipboard.canPaste(null)}
          pasteOnly
          onCommand={() =>
            run(() => {
              void clipboard.paste(null)
            })
          }
        />,
        <>
          <button
            type="button"
            role="menuitem"
            disabled={navigationDisabled}
            onClick={() => run(onManageFiles)}
          >
            <Database /> {t("Manage files")}
          </button>
          {onToggleTerminal && (
            <button
              type="button"
              role="menuitem"
              disabled={navigationDisabled}
              onClick={() => run(onToggleTerminal)}
            >
              <SquareTerminal />{" "}
              {t(terminalOpen ? "Hide terminal" : "Show terminal")}
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => run(onReveal)}>
            <FolderOpen /> {t(fileManagerMessage(platform))}
          </button>
        </>,
      ]}
    />
  )
}
