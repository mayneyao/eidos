import React, { useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { $createCodeNode } from "@lexical/code"
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import {
  $createHeadingNode,
  $createQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text"
import { $setBlocksType } from "@lexical/selection"
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  type ElementNode,
  type TextNode,
} from "lexical"

export interface MarkdownBlockCommand {
  key: string
  label: string
  description: string
  keywords: ReadonlyArray<string>
  marker: string
  run: () => void
}

class BlockCommandOption extends MenuOption {
  readonly command: MarkdownBlockCommand

  constructor(command: MarkdownBlockCommand) {
    super(command.key)
    this.command = command
  }
}

export function BlockCommandMenuPlugin() {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState<string | null>(null)
  const trigger = useBasicTypeaheadTriggerMatch("/", {
    allowWhitespace: false,
    maxLength: 32,
    minLength: 0,
  })

  const setBlock = useCallback(
    (createBlock: () => ElementNode) => {
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, createBlock)
        }
      })
    },
    [editor]
  )

  const commands = useMemo<MarkdownBlockCommand[]>(() => {
    const heading = (level: 1 | 2 | 3): MarkdownBlockCommand => ({
      key: `heading-${level}`,
      label: `Heading ${level}`,
      description: `Section heading level ${level}`,
      keywords: ["heading", "title", `h${level}`],
      marker: `H${level}`,
      run: () =>
        setBlock(() => $createHeadingNode(`h${level}` as HeadingTagType)),
    })

    return [
      {
        key: "paragraph",
        label: "Text",
        description: "Plain paragraph",
        keywords: ["paragraph", "text", "plain"],
        marker: "¶",
        run: () => setBlock(() => $createParagraphNode()),
      },
      heading(1),
      heading(2),
      heading(3),
      {
        key: "bulleted-list",
        label: "Bulleted list",
        description: "Create a simple list",
        keywords: ["bullet", "unordered", "list"],
        marker: "•",
        run: () =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
      },
      {
        key: "numbered-list",
        label: "Numbered list",
        description: "Create a numbered list",
        keywords: ["numbered", "ordered", "list"],
        marker: "1.",
        run: () =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
      },
      {
        key: "task-list",
        label: "To-do list",
        description: "Track a checkable task",
        keywords: ["todo", "task", "check", "list"],
        marker: "☐",
        run: () => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined),
      },
      {
        key: "quote",
        label: "Quote",
        description: "Emphasize a quotation",
        keywords: ["quote", "blockquote"],
        marker: "“",
        run: () => setBlock(() => $createQuoteNode()),
      },
      {
        key: "code",
        label: "Code",
        description: "Fenced code block",
        keywords: ["code", "snippet", "fence"],
        marker: "</>",
        run: () => setBlock(() => $createCodeNode()),
      },
      {
        key: "divider",
        label: "Divider",
        description: "Separate sections",
        keywords: ["divider", "rule", "separator", "hr"],
        marker: "—",
        run: () =>
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
      },
    ]
  }, [editor, setBlock])

  const options = useMemo(() => {
    const normalized = query?.trim().toLowerCase() ?? ""
    return commands
      .filter(
        (command) =>
          !normalized ||
          command.label.toLowerCase().includes(normalized) ||
          command.keywords.some((keyword) => keyword.includes(normalized))
      )
      .map((command) => new BlockCommandOption(command))
  }, [commands, query])

  const select = useCallback(
    (
      option: BlockCommandOption,
      queryNode: TextNode | null,
      closeMenu: () => void
    ) => {
      editor.update(() => {
        queryNode?.remove()
        option.command.run()
        closeMenu()
      })
    },
    [editor]
  )

  return (
    <LexicalTypeaheadMenuPlugin<BlockCommandOption>
      menuRenderFn={(
        anchor,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) =>
        anchor.current && options.length > 0
          ? createPortal(
              <div className="eidos-md-command-menu">
                <div className="eidos-md-command-heading">Turn into</div>
                <ul aria-label="Block types" role="listbox">
                  {options.map((option, index) => {
                    const command = option.command
                    const selected = selectedIndex === index
                    return (
                      <li
                        aria-selected={selected}
                        className={
                          selected ? "eidos-md-command-selected" : undefined
                        }
                        id={`eidos-md-command-${command.key}`}
                        key={option.key}
                        onClick={() => {
                          setHighlightedIndex(index)
                          selectOptionAndCleanUp(option)
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        ref={option.setRefElement}
                        role="option"
                      >
                        <span
                          aria-hidden="true"
                          className="eidos-md-command-marker"
                        >
                          {command.marker}
                        </span>
                        <span className="eidos-md-command-copy">
                          <strong>{command.label}</strong>
                          <small>{command.description}</small>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>,
              anchor.current
            )
          : null
      }
      onClose={() => setQuery(null)}
      onQueryChange={setQuery}
      onSelectOption={select}
      options={options}
      preselectFirstItem
      triggerFn={trigger}
    />
  )
}
