import type {
  MarkdownShortcutBinding,
  MarkdownShortcutOverrides,
} from "@eidos.space/markdown"

import {
  DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
  type EidosLiteKeyboardShortcuts,
} from "../shared/keyboard-shortcuts"

export function parseMarkdownBinding(
  binding: string
): MarkdownShortcutBinding | null {
  const tokens = binding.split("+")
  const keyToken = tokens.at(-1)
  if (!keyToken) return null

  const hasMod = tokens.includes("Mod")
  const hasAlt = tokens.includes("Alt")
  const hasShift = tokens.includes("Shift")

  let key = keyToken
  if (keyToken === "BracketLeft") key = "["
  else if (keyToken === "BracketRight") key = "]"
  else if (keyToken === "Backslash") key = "\\"
  else if (keyToken === "Slash") key = "/"
  else if (keyToken === "Backquote") key = "`"
  else if (keyToken === "Comma") key = ","
  else if (keyToken === "Period") key = "."
  else if (keyToken === "Minus") key = "-"
  else if (keyToken === "Equal") key = "="
  else if (keyToken === "Semicolon") key = ";"
  else if (keyToken === "Quote") key = "'"
  else if (keyToken === "Space") key = " "
  else if (keyToken.length === 1) key = keyToken.toLowerCase()

  return {
    key,
    ...(hasMod ? { primary: true } : {}),
    ...(hasAlt ? { alt: true } : {}),
    ...(hasShift ? { shift: true } : {}),
  }
}

export function markdownKeyboardShortcuts(
  shortcuts: EidosLiteKeyboardShortcuts
): MarkdownShortcutOverrides {
  const overrides: MarkdownShortcutOverrides = {}

  // 1. Toggle heading fold
  const toggleFoldBinding = shortcuts["toggle-heading-fold"]
  if (toggleFoldBinding === null) {
    overrides["heading.toggle-fold"] = false
  } else if (
    toggleFoldBinding ===
    DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS["toggle-heading-fold"]
  ) {
    overrides["heading.toggle-fold"] = [
      { alt: true, key: "[", primary: true },
      { alt: true, key: "t", primary: true },
    ]
  } else {
    const parsed = parseMarkdownBinding(toggleFoldBinding)
    if (parsed) overrides["heading.toggle-fold"] = [parsed]
  }

  // 2. Fold all headings
  const foldAllBinding = shortcuts["fold-all-headings"]
  if (foldAllBinding === null) {
    overrides["heading.fold-all"] = false
  } else {
    const parsed = parseMarkdownBinding(foldAllBinding)
    if (parsed) overrides["heading.fold-all"] = [parsed]
  }

  // 3. Unfold all headings
  const unfoldAllBinding = shortcuts["unfold-all-headings"]
  if (unfoldAllBinding === null) {
    overrides["heading.unfold-all"] = false
  } else {
    const parsed = parseMarkdownBinding(unfoldAllBinding)
    if (parsed) overrides["heading.unfold-all"] = [parsed]
  }

  // 4. Move list item up
  const moveUpBinding = shortcuts["move-list-item-up"]
  if (moveUpBinding === null) {
    overrides["list-item.move-up"] = false
    overrides["block.move-up"] = false
  } else {
    const parsed = parseMarkdownBinding(moveUpBinding)
    if (parsed) {
      overrides["list-item.move-up"] = [parsed]
      overrides["block.move-up"] = [parsed]
    }
  }

  // 5. Move list item down
  const moveDownBinding = shortcuts["move-list-item-down"]
  if (moveDownBinding === null) {
    overrides["list-item.move-down"] = false
    overrides["block.move-down"] = false
  } else {
    const parsed = parseMarkdownBinding(moveDownBinding)
    if (parsed) {
      overrides["list-item.move-down"] = [parsed]
      overrides["block.move-down"] = [parsed]
    }
  }

  // 6. Bold
  const boldBinding = shortcuts["format-bold"]
  if (boldBinding === null) {
    overrides["format.bold"] = false
  } else {
    const parsed = parseMarkdownBinding(boldBinding)
    if (parsed) overrides["format.bold"] = [parsed]
  }

  // 7. Italic
  const italicBinding = shortcuts["format-italic"]
  if (italicBinding === null) {
    overrides["format.italic"] = false
  } else {
    const parsed = parseMarkdownBinding(italicBinding)
    if (parsed) overrides["format.italic"] = [parsed]
  }

  return overrides
}
