import type { CSSProperties } from "react"

export const EXPLORER_ROW_HEIGHT = 28

export const SPACE_FILE_TREE_STYLES = {
  height: "100%",
  minHeight: 0,
  width: "100%",
  colorScheme: "inherit",
  "--explorer-row-height": `${EXPLORER_ROW_HEIGHT}px`,
  "--trees-bg-override": "transparent",
  "--trees-bg-muted-override": "var(--surface-hover)",
  "--trees-border-color-override": "var(--line)",
  "--trees-fg-override": "var(--ink)",
  "--trees-fg-muted-override": "var(--ink-muted)",
  "--trees-font-family-override": "inherit",
  "--trees-font-size-override": "12px",
  "--trees-focus-ring-color-override": "var(--focus)",
  "--trees-focus-ring-offset-override": "-1px",
  "--trees-focus-ring-width-override": "1px",
  "--trees-action-lane-width-override": "22px",
  "--trees-icon-width-override": "15px",
  "--trees-item-margin-x-override": "4px",
  "--trees-item-row-gap-override": "5px",
  "--trees-item-padding-x-override": "5px",
  "--trees-level-gap-override": "7px",
  "--trees-padding-inline-override": "5px",
  "--trees-scrollbar-gutter-override": "var(--explorer-scrollbar-width, 6px)",
  "--trees-scrollbar-thumb-override": "var(--scrollbar-thumb)",
  "--trees-selected-bg-override":
    "color-mix(in srgb, var(--surface-selected) 50%, transparent)",
  "--trees-selected-fg-override": "var(--ink)",
} as CSSProperties

export const EXPLORER_TREE_CSS = `
  :host {
    display: block;
    min-height: 0;
    box-sizing: border-box;
    /* Pierre clamps scrollTop to row height × count minus viewport height.
       Keep vertical spacing outside its scrollport so the native scrollbar
       and the virtualizer agree on the bottom boundary. */
    padding-block: 3px 8px;
  }

  button[data-type="item"] {
    border-radius: 3px;
  }

  [data-file-tree-virtualized-scroll="true"]::-webkit-scrollbar-thumb {
    min-width: 2.5rem;
    min-height: 2.5rem;
    border: 1px solid transparent;
    border-radius: 999px;
    background-clip: padding-box;
  }

  [data-file-tree-virtualized-scroll="true"]::-webkit-scrollbar-thumb:hover {
    background-color: var(--scrollbar-thumb-hover);
  }

  [data-file-tree-virtualized-scroll="true"]::-webkit-scrollbar-thumb:active {
    background-color: var(--scrollbar-thumb-active);
  }

  button[data-type="item"]:focus-visible {
    outline-offset: -1px;
  }

  button[data-type="item"][data-item-dragging] {
    opacity: 0.45;
  }

  button[data-type="item"][data-item-drag-target] {
    background: var(--surface-selected);
    box-shadow: inset 0 0 0 1px var(--focus);
  }

  button[data-type="item"][data-external-drop-target] {
    background: var(--surface-selected);
    box-shadow: inset 0 0 0 1px var(--focus);
  }
`
