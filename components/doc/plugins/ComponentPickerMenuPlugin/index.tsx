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
  CaseSensitiveIcon,
  CodeIcon,
  FileQuestionIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  MinusSquareIcon,
  QuoteIcon,
  SheetIcon,
  SparklesIcon,
  TableIcon,
  VariableIcon,
  icons,
} from "lucide-react"
import * as ReactDOM from "react-dom"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { BuiltInBlocks } from "../../blocks"
import { useExtBlocks } from "../../hooks/use-ext-blocks"
import { useModal } from "../../hooks/useModal"
import { bgColors, fgColors } from "../const"
import { useBasicTypeaheadTriggerMatch } from "./hook"
import "./index.css"

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
  audio: <AudioLinesIcon className="h-5 w-5" />,
  database: <SheetIcon className="h-5 w-5" />,
  text: <CaseSensitiveIcon className="h-5 w-5" />,
  hr: <MinusSquareIcon className="h-5 w-5" />,
  sql: <VariableIcon className="h-5 w-5" />,
  table: <TableIcon className="h-5 w-5" />,
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
  const { t } = useTranslation()
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
        new ComponentPickerOption(
          t("doc.menu.insertTable", { rows, columns }),
          {
            icon: <TableIcon className="h-5 w-5" />,
            keywords: ["table"],
            onSelect: () =>
              editor.dispatchCommand(INSERT_TABLE_COMMAND, {
                columns: columns.toString(),
                rows: rows.toString(),
                includeHeaders: false,
              }),
          }
        )
      )
    } else if (partialTableMatch) {
      const rows = parseInt(partialTableMatch[0], 10)

      options.push(
        ...Array.from({ length: 5 }, (_, i) => i + 1).map(
          (columns) =>
            new ComponentPickerOption(
              t("doc.menu.insertTable", { rows, columns }),
              {
                icon: <TableIcon className="h-5 w-5" />,
                keywords: ["table"],
                onSelect: () =>
                  editor.dispatchCommand(INSERT_TABLE_COMMAND, {
                    columns: columns.toString(),
                    rows: rows.toString(),
                    includeHeaders: false,
                  }),
              }
            )
        )
      )
    }

    return options
  }, [editor, queryString, t])

  const options = useMemo(() => {
    const baseOptions = [
      new ComponentPickerOption(t("doc.menu.paragraph"), {
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
          new ComponentPickerOption(t("doc.menu.heading", { n }), {
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
      new ComponentPickerOption(t("doc.menu.numberedList"), {
        icon: IconMap["lo"],
        keywords: ["numbered list", "ordered list", "ol"],
        onSelect: () =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
      }),
      new ComponentPickerOption(t("doc.menu.bulletedList"), {
        icon: IconMap["ul"],
        keywords: ["bulleted list", "unordered list", "ul"],
        onSelect: () =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
      }),
      new ComponentPickerOption(t("doc.menu.checkList"), {
        icon: IconMap["cl"],
        keywords: ["check list", "todo list"],
        onSelect: () =>
          editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined),
      }),
      new ComponentPickerOption(t("doc.menu.quote"), {
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
      new ComponentPickerOption(t("doc.menu.code"), {
        icon: IconMap["code"],
        keywords: ["javascript", "python", "js", "codeblock"],
        onSelect: () =>
          editor.update(() => {
            const selection = $getSelection()

            if ($isRangeSelection(selection)) {
              if (selection.isCollapsed()) {
                $setBlocksType(selection, () => $createCodeNode())
              } else {
                const textContent = selection.getTextContent()
                const codeNode = $createCodeNode()
                selection.insertNodes([codeNode])
                selection.insertRawText(textContent)
              }
            }
          }),
      }),
      new ComponentPickerOption(t("doc.menu.divider"), {
        icon: IconMap["hr"],
        keywords: ["horizontal rule", "divider", "hr"],
        onSelect: () =>
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
      }),
      new ComponentPickerOption(t("doc.menu.table"), {
        icon: IconMap["table"],
        keywords: ["table"],
        onSelect: () =>
          editor.dispatchCommand(INSERT_TABLE_COMMAND, {
            columns: "3",
            rows: "3",
            includeHeaders: false,
          }),
      }),
      ...BuiltInBlocks.filter((block) => !block.hiddenInMenu).map((block) => {
        const iconName = block.icon
        const BlockIcon = (icons as any)[iconName] ?? FileQuestionIcon
        return new ComponentPickerOption(block.name, {
          icon: <BlockIcon className="h-5 w-5" />,
          keywords: block.keywords,
          onSelect: () => block.onSelect(editor),
        })
      }),
      ...bgColors.map(({ name, value }) => {
        return new ComponentPickerOption(t("doc.menu.background", { name }), {
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
        return new ComponentPickerOption(t("doc.menu.color", { name }), {
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
  }, [editor, extBlocks, getDynamicOptions, queryString, showModal, t])

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
