# Design Lite sidebar plugins

Read this when developing or revising a View placed at `sidebar/explorer`.
Treat it as content inside Lite's Explorer, with the same density, visual
baselines and scrolling behavior as the built-in Explorer. A standalone Web
page is useful for iteration; final layout acceptance belongs in Lite.

## Establish the actual embedding

Use the installed SDK and matching checkout, not an assumed iframe size.
`sidebar/explorer` mounts a page View inside the sidebar; its width follows the
user's sidebar resize. A plugin may also have an independent page View for
detailed content. Keep that page's layout separate from its narrow sidebar.

When working in the Eidos repository, inspect these sources for the current
presentation contract:

- `apps/eidos-lite-desktop/src/renderer/plugin-explorer.tsx`: pane and lifecycle.
- `apps/eidos-lite-desktop/src/renderer/styles.css`: `.space-heading`,
  `.explorer-layout-switch`, `.explorer`, `.plugin-explorer-pane`, and the
  built-in Explorer's scroll regions.
- `apps/eidos-lite-desktop/src/renderer/plugin-theme.ts` and
  `packages/plugin-runtime/src/{browser-bootstrap,sandbox}.ts`: tokens actually
  forwarded to the iframe and default document/scrollbar styles.

These filenames are checkout references, not plugin imports. Outside a checkout,
inspect the installed host in a disposable Space and use its supported SDK.
Do not invent SDK tokens or capabilities to imitate private host CSS variables.

## Give each boundary one owner

| Concern                                                                                    | Owner and plugin behavior                                                                                            |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Window controls, titlebar drag areas, Explorer tabs, Space identity, sidebar resize handle | Host. Do not reproduce them inside the View.                                                                         |
| Outer pane dimensions and any reserved resize strip                                        | Host. Fill the supplied iframe; do not add the host's reservation again.                                             |
| Search, local actions, list rows and optional footer                                       | Plugin. Define one content inset and one trailing action column.                                                     |
| List overflow                                                                              | Plugin. One scrolling list below a fixed toolbar; keep body/root from becoming an additional scroll region.          |
| Theme and typography                                                                       | Host semantic values. Consume the values the host supplies; preserve usable local fallbacks for an isolated preview. |

Use a full-size root with no browser-default margins, `box-sizing: border-box`,
`min-width: 0`, `min-height: 0` and a column flex layout. Let the list take the
remaining height with `flex: 1; min-height: 0; overflow: hidden auto`. Keep the
toolbar and optional footer outside that list. Avoid viewport-based desktop
widths, fixed minimum panel widths or an extra bordered/card-shaped shell.

## Align content and actions

Choose insets once. Do not accumulate root padding, toolbar padding, list padding
and row padding independently. For the current compact Lite Explorer, a useful
starting point is a 12 CSS px leading content baseline, 14–16px glyphs and
24–28px icon-button targets. Use 12–13px text, restrained secondary text, and
row heights appropriate to the content. A two-line conversation row can be
taller than a single-line file row; its columns should still align.

Align search/leading icons, list text and trailing actions deliberately. If the
list reserves a scrollbar gutter, reserve that same width beside the toolbar's
trailing action so its column does not shift when overflow appears. Keep actions
non-shrinking. Truncate long titles/previews with `min-width: 0`, hidden overflow
and ellipsis; allow search text to shrink before moving an action out of view.

Measure the resulting icon centers and content edges against the host's toolbar
and built-in Explorer at the same sidebar width and zoom. Account for the host's
actual iframe boundary first. Compare controls that share a content or action
column; navigation tabs and plugin actions need not share an icon center. If a
host inset prevents a common baseline, correct that adapter boundary or use an
explicitly supported geometry contract. Do not compensate with negative margins,
transforms, parent DOM access or guessed window-control offsets inside the plugin.

Keep secondary row actions available on hover, keyboard focus and a contextual
menu. Give icon buttons accessible names and preserve visible focus. Use groups
only when they help the content; do not add generic section headings or counts
between Search and a simple list. A running indicator can stay on its row without
moving that row into a separate section.

## Keep scrolling narrow and stable

Do not assume the host's parent CSS crosses the iframe boundary. The sandbox's
default scrollbar may be wider than the built-in Explorer's. Inspect the
scroller's computed styles, including any inherited `scrollbar-width` and
sandbox `::-webkit-scrollbar` rules.

The current built-in Explorer uses a 6 CSS px scrollbar. Override the sidebar's
actual scroll element with a scoped rule when needed; do not globally change
every scrollbar in a plugin that also renders full pages or editors. Use a
transparent track, rounded thumb and host semantic thumb colors. Keep scrolling
and thumb dragging functional. If the thumb is normally quiet, reveal it on
hover/focus and retain sufficient contrast. Do not solve width by disabling
scrolling or hiding an overflowing list.

For an Electron sidebar, this is a local styling example, not new SDK tokens:

```css
.plugin-sidebar {
  --sidebar-scrollbar-size: 6px;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--eidos-background, transparent);
  color: var(--eidos-foreground, inherit);
  font-family: var(--eidos-font-family, system-ui);
}
.plugin-toolbar {
  flex: none;
  padding-inline-end: var(--sidebar-scrollbar-size);
}
.plugin-list {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden auto;
  scrollbar-gutter: stable;
}
.plugin-list::-webkit-scrollbar {
  width: var(--sidebar-scrollbar-size);
  height: var(--sidebar-scrollbar-size);
}
.plugin-list::-webkit-scrollbar-track {
  background: transparent;
}
.plugin-list::-webkit-scrollbar-thumb {
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(
    --eidos-scrollbar-thumb,
    color-mix(in oklab, var(--eidos-foreground, currentColor) 14%, transparent)
  );
  background-clip: padding-box;
}
```

Forwarded token sets differ by host version. Use `--eidos-background` for the
supplied surface; do not assume it means white/editor canvas or that an extra
`--eidos-surface` token exists. Verify foreground, muted, hover/selected, focus,
font family and light/dark appearance. Do not hardcode a second tinted background
over the Explorer or remount the list when theme values change.

## Preserve navigation continuity

Keep rows keyed by stable identity and update content/state in place. Selection,
busy bookkeeping or opening a conversation must not refresh its message-update
time or reorder the list. Retain search, scroll and focused controls while
background data changes. Apply data and identity together when a new selection
is ready; discard late results and dispose listeners on unmount. Loading must
not replace the whole sidebar with a blank frame or spinner.

## Verify the embedded result

Use disposable content with enough rows to overflow, long titles/previews and
empty/one-row states. In a standalone fixture, reproduce the sidebar's width,
height, host tokens and iframe constraints, plus an adjacent host reference
toolbar. A large centered chat-page screenshot cannot validate a sidebar.

Before calling the layout accepted, exercise it in the actual Lite shell:

- Compare leading text/icon edges, toolbar/row action centers and the scrollbar
  edge with the built-in Explorer; measure CSS pixels as well as taking a
  screenshot that includes the host toolbar and sidebar boundary.
- Resize from the host's minimum width to the normal width; check long content,
  100% and 125% app zoom, light/dark themes, and both short and overflowing lists.
- Scroll with wheel/trackpad and drag the thumb near the sidebar resize handle.
  Verify the toolbar stays fixed, no second scrollbar appears, and list scrolling
  does not accidentally resize the pane.
- Use keyboard focus, row actions and rapid selection during delayed reads.
  Confirm stable rows, drafts/search/scroll preservation and actionable errors.

Follow the repository's development-launch and exact-window ownership rules.
Report standalone fixture evidence separately from native Lite acceptance, and
state which OS/zoom/width combinations were actually checked. A passing package
check proves API compatibility; it does not prove visual alignment or scrolling.
