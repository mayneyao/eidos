/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useCallback, useMemo, useState } from "react"
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
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text"
import { $patchStyleText, $setBlocksType } from "@lexical/selection"
import { INSERT_TABLE_COMMAND } from "@lexical/table"
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  TextNode,
} from "lexical"
import {
  AudioLinesIcon,
  BaselineIcon,
  BookMarkedIcon,
  CaseSensitiveIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  MinusSquareIcon,
  QuoteIcon,
  SheetIcon,
  SparklesIcon,
  VariableIcon,
  icons,
} from "lucide-react"
import * as ReactDOM from "react-dom"

import { cn } from "@/lib/utils"
import { TocIcon } from "@/components/icons/toc"

import { useModal } from "../../hooks/useModal"
import { SelectDatabaseTableDialog } from "../DatabasePlugin/SelectDatabaseTableDialog"
import { SqlQueryDialog } from "../SQLPlugin/SqlQueryDialog"
import { bgColors, fgColors } from "../const"
import "./index.css"
import { BuiltInBlocks } from "../../blocks"
import { useExtBlocks } from "../../hooks/use-ext-blocks"
import { INSERT_BOOKMARK_COMMAND } from "../BookmarkPlugin"
import { INSERT_IMAGE_COMMAND } from "../ImagesPlugin"
import { INSERT_TOC_COMMAND } from "../TableOfContentsPlugin"
import { useBasicTypeaheadTriggerMatch } from "./hook"

const IconMap: Record<string, JSX.Element> = {
  h1: <Heading1Icon className="h-5 w-5" />,
  h2: <Heading2Icon className="h-5 w-5" />,
  h3: <Heading3Icon className="h-5 w-5" />,
  ai: <SparklesIcon className="h-5 w-5" />,
  lo: <ListOrderedIcon className="h-5 w-5" />,
  ul: <ListIcon className="h-5 w-5" />,
  cl: <ListChecksIcon className="h-5 w-5" />,
  quote: <QuoteIcon className="h-5 w-5" />,
  code: <CodeIcon className="h-5 w-5" />,
  image: <ImageIcon className="h-5 w-5" />,
  audio: <AudioLinesIcon className="h-5 w-5" />,
  database: <SheetIcon className="h-5 w-5" />,
  text: <CaseSensitiveIcon className="h-5 w-5" />,
  hr: <MinusSquareIcon className="h-5 w-5" />,
  sql: <VariableIcon className="h-5 w-5" />,
  bookmark: <BookMarkedIcon className="h-5 w-5" />,
}

class ComponentPickerOption extends MenuOption {
  // What shows up in the editor
  title: string
  // Icon for display
  icon?: JSX.Element
  // For extra searching.
  keywords: Array<string>
  // TBD
  keyboardShortcut?: string
  //
  disabled?: boolean
  // What happens when you select this option?
  onSelect: (queryString: string) => void

  constructor(
    title: string,
    options: {
      icon?: JSX.Element
      keywords?: Array<string>
      disabled?: boolean
      keyboardShortcut?: string
      onSelect: (queryString: string) => void
    }
  ) {
    super(title)
    this.title = title
    this.keywords = options.keywords || []
    this.icon = options.icon
    this.keyboardShortcut = options.keyboardShortcut
    this.disabled = options.disabled
    this.onSelect = options.onSelect.bind(this)
  }
}

function ComponentPickerMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number
  isSelected: boolean
  onClick: () => void
  onMouseEnter: () => void
  option: ComponentPickerOption
}) {
  let className = "item"
  if (isSelected) {
    className += " selected"
  }
  return (
    <li
      key={option.key}
      tabIndex={-1}
      className={cn(className, "flex gap-2", option.disabled && "disabled")}
      ref={option.setRefElement}
      role="option"
      aria-selected={isSelected}
      id={"typeahead-item-" + index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {option.icon}
      <span className="text">{option.title}</span>
    </li>
  )
}

export function ComponentPickerMenuPlugin(): JSX.Element {
  const [editor] = useLexicalComposerContext()
  const [modal, showModal] = useModal()
  const [queryString, setQueryString] = useState<string | null>(null)
  const extBlocks = useExtBlocks()

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("/、", {
    minLength: 0,
  })

  const getDynamicOptions = useCallback(() => {
    const options: Array<ComponentPickerOption> = []

    if (queryString == null) {
      return options
    }

    const fullTableRegex = new RegExp(/^([1-9]|10)x([1-9]|10)$/)
    const partialTableRegex = new RegExp(/^([1-9]|10)x?$/)

    const fullTableMatch = fullTableRegex.exec(queryString)
    const partialTableMatch = partialTableRegex.exec(queryString)

    if (fullTableMatch) {
      const [rows, columns] = fullTableMatch[0]
        .split("x")
        .map((n: string) => parseInt(n, 10))

      options.push(
        new ComponentPickerOption(`${rows}x${columns} Table`, {
          icon: <i className="icon table" />,
          keywords: ["table"],
          onSelect: () =>
            // @ts-ignore Correct types, but since they're dynamic TS doesn't like it.
            editor.dispatchCommand(INSERT_TABLE_COMMAND, { columns, rows }),
        })
      )
    } else if (partialTableMatch) {
      const rows = parseInt(partialTableMatch[0], 10)

      options.push(
        ...Array.from({ length: 5 }, (_, i) => i + 1).map(
          (columns) =>
            new ComponentPickerOption(`${rows}x${columns} Table`, {
              icon: <i className="icon table" />,
              keywords: ["table"],
              onSelect: () =>
                // @ts-ignore Correct types, but since they're dynamic TS doesn't like it.
                editor.dispatchCommand(INSERT_TABLE_COMMAND, { columns, rows }),
            })
        )
      )
    }

    return options
  }, [editor, queryString])

  const options = useMemo(() => {
    const baseOptions = [
      // new ComponentPickerOption("AI Complete", {
      //   icon: IconMap["ai"],
      //   keywords: ["ai", "auto"],
      //   onSelect: () => editor.dispatchCommand(AI_COMPLETE_COMMAND, ""),
      // }),
      new ComponentPickerOption("Paragraph", {
        icon: IconMap["text"],
        keywords: ["normal", "paragraph", "p", "text"],
        onSelect: () =>
          editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              $setBlocksType(selection, () => $createParagraphNode())
            }
          }),
      }),
      ...Array.from({ length: 3 }, (_, i) => i + 1).map(
        (n) =>
          new ComponentPickerOption(`Heading ${n}`, {
            icon: IconMap[`h${n}`],
            keywords: ["heading", "header", `h${n}`],
            onSelect: () =>
              editor.update(() => {
                const selection = $getSelection()
                if ($isRangeSelection(selection)) {
                  $setBlocksType(selection, () =>
                    // @ts-ignore Correct types, but since they're dynamic TS doesn't like it.
                    $createHeadingNode(`h${n}`)
                  )
                }
              }),
          })
      ),
      new ComponentPickerOption("Numbered List", {
        icon: IconMap["lo"],
        keywords: ["numbered list", "ordered list", "ol"],
        onSelect: () =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
      }),
      new ComponentPickerOption("Bulleted List", {
        icon: IconMap["ul"],
        keywords: ["bulleted list", "unordered list", "ul"],
        onSelect: () =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
      }),
      new ComponentPickerOption("Check List", {
        icon: IconMap["cl"],
        keywords: ["check list", "todo list"],
        onSelect: () =>
          editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined),
      }),
      new ComponentPickerOption("Quote", {
        icon: IconMap["quote"],
        keywords: ["block quote"],
        onSelect: () =>
          editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              $setBlocksType(selection, () => $createQuoteNode())
            }
          }),
      }),
      new ComponentPickerOption("Code", {
        icon: IconMap["code"],
        keywords: ["javascript", "python", "js", "codeblock"],
        onSelect: () =>
          editor.update(() => {
            const selection = $getSelection()

            if ($isRangeSelection(selection)) {
              if (selection.isCollapsed()) {
                $setBlocksType(selection, () => $createCodeNode())
              } else {
                // Will this ever happen?
                const textContent = selection.getTextContent()
                const codeNode = $createCodeNode()
                selection.insertNodes([codeNode])
                selection.insertRawText(textContent)
              }
            }
          }),
      }),
      new ComponentPickerOption("Divider", {
        icon: IconMap["hr"],
        keywords: ["horizontal rule", "divider", "hr"],
        onSelect: () =>
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
      }),

      new ComponentPickerOption("Image", {
        icon: IconMap["image"],
        keywords: ["image", "img"],
        onSelect: () =>
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
            src: "",
            altText: "",
          }),
      }),

      ...BuiltInBlocks.map((block) => {
        const iconName = block.icon
        const BlockIcon = (icons as any)[iconName]
        return new ComponentPickerOption(block.name, {
          icon: <BlockIcon className="h-5 w-5" />,
          keywords: block.keywords,
          onSelect: () => block.onSelect(editor),
        })
      }),

      new ComponentPickerOption("Bookmark", {
        icon: IconMap["bookmark"],
        keywords: ["bookmark"],
        onSelect: () =>
          editor.dispatchCommand(INSERT_BOOKMARK_COMMAND, {
            url: "",
          }),
      }),

      new ComponentPickerOption("Table Of Content", {
        icon: <TocIcon />,
        keywords: ["table of content", "toc"],
        onSelect: () => editor.dispatchCommand(INSERT_TOC_COMMAND, undefined),
      }),

      new ComponentPickerOption("Query", {
        icon: IconMap["sql"],
        keywords: ["query", "sql"],
        onSelect: () =>
          showModal("Insert SqlQuery", (onClose) => (
            <SqlQueryDialog activeEditor={editor} onClose={onClose} />
          )),
      }),

      new ComponentPickerOption("DatabaseTable", {
        icon: IconMap["database"],
        keywords: ["database", "table"],
        disabled: true,
        onSelect: () => {
          // disable for now
          return
          showModal("Insert Database Table", (onClose) => (
            <SelectDatabaseTableDialog
              activeEditor={editor}
              onClose={onClose}
            />
          ))
        },
      }),

      // ...["left", "center", "right", "justify"].map(
      //   (alignment) =>
      //     new ComponentPickerOption(`Align ${alignment}`, {
      //       icon: <i className={`icon ${alignment}-align`} />,
      //       keywords: ["align", "justify", alignment],
      //       onSelect: () =>
      //         // @ts-ignore Correct types, but since they're dynamic TS doesn't like it.
      //         editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment),
      //     })
      // ),
      ...bgColors.map(({ name, value }) => {
        return new ComponentPickerOption(`Background ${name}`, {
          icon: (
            <BaselineIcon
              style={{ backgroundColor: value }}
              className="h-5 w-5"
            />
          ),
          keywords: ["bg", "background", name, `${name}bg`],
          onSelect: () =>
            editor.update(() => {
              const selection = $getSelection()
              if ($isRangeSelection(selection)) {
                let maybeNode = selection.anchor.getNode()
                if ($isTextNode(maybeNode)) {
                  const _selection = maybeNode.select()
                  _selection.anchor.offset = 0
                  $patchStyleText(_selection, {
                    "background-color": value,
                  })
                }
              }
            }),
        })
      }),
      ...fgColors.map(({ name, value }) => {
        return new ComponentPickerOption(`Color ${name}`, {
          icon: <BaselineIcon style={{ color: value }} className="h-5 w-5" />,
          keywords: ["color", name],
          onSelect: () =>
            editor.update(() => {
              const selection = $getSelection()
              if ($isRangeSelection(selection)) {
                let maybeNode = selection.anchor.getNode()
                if ($isTextNode(maybeNode)) {
                  const _selection = maybeNode.select()
                  _selection.anchor.offset = 0
                  $patchStyleText(_selection, {
                    color: value,
                  })
                }
              }
            }),
        })
      }),
      ...extBlocks.map((block) => {
        const iconName = block.icon
        const BlockIcon = (icons as any)[iconName]
        return new ComponentPickerOption(block.name, {
          icon: <BlockIcon className="h-5 w-5" />,
          keywords: block.keywords,
          onSelect: () => block.onSelect(editor),
        })
      }),

      // ...["left", "center", "right", "justify"].map(
      //   (alignment) =>
      //     new ComponentPickerOption(`Align ${alignment}`, {
      //       icon: <i className={`icon ${alignment}-align`} />,
      //       keywords: ["align", "justify", alignment],
      //       onSelect: () =>
      //         // @ts-ignore Correct types, but since they're dynamic TS doesn't like it.
      //         editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment),
      //     })
      // ),
    ]

    const dynamicOptions = getDynamicOptions()

    return queryString
      ? [
          ...dynamicOptions,
          ...baseOptions.filter((option) => {
            return new RegExp(queryString, "gi").exec(option.title) ||
              option.keywords != null
              ? option.keywords.some((keyword) =>
                  new RegExp(queryString, "gi").exec(keyword)
                )
              : false
          }),
        ]
      : baseOptions
  }, [editor, extBlocks, getDynamicOptions, queryString, showModal])

  const onSelectOption = useCallback(
    (
      selectedOption: ComponentPickerOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
      matchingString: string
    ) => {
      editor.update(() => {
        if (nodeToRemove) {
          nodeToRemove.remove()
        }
        selectedOption.onSelect(matchingString)
        closeMenu()
      })
    },
    [editor]
  )

  return (
    <>
      {modal}
      <LexicalTypeaheadMenuPlugin<ComponentPickerOption>
        onQueryChange={setQueryString}
        onSelectOption={onSelectOption}
        triggerFn={checkForTriggerMatch}
        options={options}
        menuRenderFn={(
          anchorElementRef,
          { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
        ) =>
          anchorElementRef.current && options.length
            ? ReactDOM.createPortal(
                <div className="typeahead-popover component-picker-menu">
                  <ul>
                    {options.map((option, i: number) => (
                      <ComponentPickerMenuItem
                        index={i}
                        isSelected={selectedIndex === i}
                        onClick={() => {
                          setHighlightedIndex(i)
                          selectOptionAndCleanUp(option)
                        }}
                        onMouseEnter={() => {
                          setHighlightedIndex(i)
                        }}
                        key={option.key}
                        option={option}
                      />
                    ))}
                  </ul>
                </div>,
                anchorElementRef.current
              )
            : null
        }
      />
    </>
  )
}
