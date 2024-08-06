import { useEffect, useMemo, useState } from "react"
import { $createCodeNode } from "@lexical/code"
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list"
import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text"
import { $setBlocksType } from "@lexical/selection"
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from "lexical"
import {
  AudioLinesIcon,
  BookMarkedIcon,
  CaseSensitiveIcon,
  CodeIcon,
  GitCompareArrowsIcon,
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
} from "lucide-react"

import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"

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

const textBasedNodes = ["paragraph", "heading", "list", "quote", "code"]

export const TurnIntoMenu = ({
  editor,
  currentNodeKey,
}: {
  editor: LexicalEditor
  currentNodeKey: NodeKey | null
}) => {
  const [currentNode, setCurrentNode] = useState<LexicalNode | null>(null)
  const shouldShow = useMemo(() => {
    return currentNode && textBasedNodes.includes(currentNode.__type)
  }, [currentNode])

  useEffect(() => {
    editor.update(() => {
      if (currentNodeKey) {
        const node = $getNodeByKey(currentNodeKey)
        setCurrentNode(node)
      }
    })
  }, [currentNodeKey, editor])
  const options = useMemo(() => {
    const baseOptions = [
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
    ]
    if (currentNode && currentNode.__type === "list") {
      return baseOptions.filter((option) => option.title.includes("List"))
    }
    return baseOptions
  }, [currentNode, editor])

  if (!shouldShow) {
    return null
  }
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <GitCompareArrowsIcon className="mr-2 h-4 w-4"></GitCompareArrowsIcon>
        <span>Turn into</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          {options.map((option) => (
            <DropdownMenuItem
              className="flex gap-2"
              key={option.title}
              onSelect={() => {
                editor.update(() => {
                  const someNode =
                    currentNodeKey && $getNodeByKey(currentNodeKey)
                  if (someNode) {
                    someNode.selectStart()
                  }
                })
                option.onSelect("")
              }}
            >
              {option.icon}
              {option.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}
