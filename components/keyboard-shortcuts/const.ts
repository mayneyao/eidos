export const TableKeyboardShortcuts = [
  {
    key: "Arrow",
    description:
      "Moves the currently selected cell and clears other selections",
  },
  {
    key: "Shift + Arrow",
    description:
      "Extends the current selection range in the direction pressed.",
  },
  {
    key: "Alt + Arrow",
    description:
      "Moves the currently selected cell and retains the current selection",
  },
  {
    key: "Ctrl/Cmd + Arrow | Home/End",
    description:
      "Move the selection as far as possible in the direction pressed.",
  },
  {
    key: "Ctrl/Cmd + Shift + Arrow",
    description:
      "Extends the selection as far as possible in the direction pressed.",
  },
  {
    key: "Shift + Home/End",
    description:
      "Extends the selection as far as possible in the direction pressed.",
  },
  {
    key: "Ctrl/Cmd + A",
    description: "Selects all cells.",
  },
  {
    key: "Shift + Space",
    description: "Selecs the current row.",
  },
  {
    key: "Ctrl + Space",
    description: "Selects the current col.",
  },
  {
    key: "PageUp/PageDown",
    description: "Moves the current selection up/down by one page.",
  },
  {
    key: "Escape",
    description: "Clear the current selection.",
  },
  {
    key: "Ctrl/Cmd + D",
    description:
      "Data from the first row of the range will be down filled into the rows below it",
    flag: "downFill",
  },
  {
    key: "Ctrl/Cmd + R",
    description:
      "Data from the first column of the range will be right filled into the columns next to it",
    flag: "rightFill",
  },
  {
    key: "Ctrl/Cmd + C",
    description: "Copies the current selection.",
  },
  {
    key: "Ctrl/Cmd + V",
    description: "Pastes the current buffer into the grid.",
  },
  {
    key: "Ctrl/Cmd + F",
    description: "Opens the search interface.(disabled for now)",
    flag: "search",
    disabled: true,
  },
  {
    key: "Ctrl/Cmd + Home/End",
    description: "Move the selection to the first/last cell in the data grid.",
    flag: "first/last",
  },
  {
    key: "Ctrl/Cmd + Shift + Home/End",
    description:
      "Extend the selection to the first/last cell in the data grid.",
    flag: "first/last",
  },
]

/**
 * support most markdown syntax
 */
export const DocumentKeyboardShortcuts = [
  {
    key: "Ctrl/Cmd + B",
    description: "Bold text",
  },
  {
    key: "Ctrl/Cmd + I",
    description: "Italicize text",
  },
  {
    key: "Ctrl/Cmd + U",
    description: "Underline text",
  },
  {
    key: "Ctrl/Cmd + S",
    description: "Save the document",
  },
  {
    key: "#",
    description: "Heading 1",
  },
  {
    key: "##",
    description: "Heading 2",
  },
  {
    key: "###",
    description: "Heading 3",
  },
  {
    key: "[]",
    description: "Checkbox",
  },
  {
    key: "-",
    description: "Unordered List",
  },
  {
    key: "number + .",
    description: "Ordered List",
  },
  {
    key: "```",
    description: "Code Block",
  },
  {
    key: "---",
    description: "Horizontal Rule",
  },
]

export const CommonKeyboardShortcuts = [
  {
    key: "Ctrl/Cmd + /",
    description: "Toggle chatbot",
  },
  {
    key: "Ctrl/Cmd + \\",
    description: "Toggle sidebar",
  },
  {
    key: "Ctrl/Cmd + Shift + L",
    description: "Toggle light/dark mode",
  },
  {
    key: "Ctrl/Cmd + K",
    description: "Toggle command palette",
  },
]
