# Eidos Lite theme specification

## Status and scope

This document is the normative theme contract for Eidos Lite Desktop. It
defines how appearance preferences, chrome colors, editor themes, semantic
tokens, and component states fit together. It does not make custom themes a
Public v1 feature by itself.

The current product continues to expose **System**, **Light**, and **Dark**.
The data model below is the compatibility target for future custom-theme and
font controls, so those controls can be added without inventing a second theme
system.

Normative terms such as **must**, **should**, and **may** describe requirements
for new or changed Eidos Lite UI.

## Reference model

Codex Desktop separates the user's appearance mode from the values that make
up a theme. Its documented controls include a base theme, accent, background,
foreground, UI font, and code font. The current desktop configuration also
keeps independent light and dark chrome themes, independent light and dark
code themes, a contrast input, reduced-motion preference, and semantic diff
colors.

Eidos Lite adopts that separation, not Codex's product-specific palette or
Codex-only semantic roles. See the official
[Codex Desktop appearance settings](https://learn.chatgpt.com/docs/reference/settings#appearance).

## Principles

1. **Content owns the window.** The default canvas is the background for the
   editor, title bars, Settings, Welcome, dialogs, and other application
   chrome.
2. **Only the Space Explorer gets a persistent tinted surface.** A title bar,
   Settings sidebar, toolbar, or status row must not introduce another
   full-area background.
3. **Theme input and component color are different layers.** Components consume
   semantic tokens, never stored theme fields or raw palette values.
4. **Light and dark are complete themes.** Dark mode is not a filter or an
   inversion of the light palette.
5. **Chrome and editors resolve together.** A theme change updates the
   application chrome, Eidos File UI, text/code editor, and diff surfaces in
   one state transition.
6. **Color supports meaning but never carries it alone.** Labels, icons, text,
   or shape must remain sufficient for status, errors, diffs, and selection.
7. **Quiet structure beats decoration.** Prefer spacing and alignment over
   filled panels; use hairlines before shadows and shadows only for overlays
   or controls that need depth.

## Preference and theme model

The public persistence contract should converge on this shape when custom
theme controls are implemented:

```ts
type AppearancePreference = "system" | "light" | "dark"
type MotionPreference = "system" | "on" | "off"
type DiffMarkerStyle = "color" | "symbols"
type HexColor = `#${string}`

interface EidosLiteChromeTheme {
  version: 1
  surface: HexColor
  ink: HexColor
  accent: HexColor
  contrast: number // integer, 0..100
  opaqueWindows: boolean
  fonts: {
    ui: string | null
    code: string | null
  }
  semanticColors: {
    success: HexColor
    warning: HexColor
    danger: HexColor
    diffAdded: HexColor
    diffRemoved: HexColor
  }
}

interface EidosLiteThemePreferences {
  appearance: AppearancePreference
  chromeThemes: {
    light: EidosLiteChromeTheme
    dark: EidosLiteChromeTheme
  }
  codeThemes: {
    light: string
    dark: string
  }
  fontSizes: {
    ui: number
    code: number
  }
  diffMarkerStyle: DiffMarkerStyle
  reducedMotion: MotionPreference
}
```

Rules:

- `appearance` selects a variant; it does not contain palette values.
- Light and dark customizations are stored independently. Editing one variant
  must not mutate the other.
- Stored colors use six-digit sRGB hex for portability. The renderer may
  convert them to OKLCH before deriving tokens.
- `contrast` is an integer from `0` to `100`, with `45` as the Eidos default.
  It controls derived neutral separation, not text opacity directly.
- `null` font values inherit the platform stack. Font names are data, not raw
  CSS declarations.
- `opaqueWindows` defaults to `true`. Translucent native chrome is an explicit
  future enhancement and must never make content, focus, or text contrast
  depend on the desktop wallpaper.
- A custom theme is accepted only when the whole selected variant validates.
  Do not silently mix malformed custom values with a built-in theme.
- Product-specific roles may extend `semanticColors`, but may not replace the
  core success, warning, danger, and diff roles.

## Resolution lifecycle

There is one resolved appearance for each window:

```text
appearance preference + operating-system color scheme
                         ↓
                 resolved light | dark
                         ↓
       chrome theme + code theme + component adapters
```

The renderer must perform these updates as one operation:

1. Resolve `system` with `prefers-color-scheme`.
2. Set `data-theme`, the Tailwind-compatible `.dark` class, and the native
   `color-scheme` value on the document root.
3. Install the selected chrome theme inputs and derived semantic tokens.
4. Select the matching Eidos File, text/code editor, and diff theme.
5. Update mounted editors in place. Theme switching must not remount the active
   file, show a loading route, discard a text draft, or reset selection and
   scroll position.

Operating-system changes are observed only while the preference is `system`.
Explicit Light or Dark remains stable until the user changes it. Windows that
receive a preferences update must resolve from the new preference rather than
copying another window's already-resolved value.

## Token architecture

### Layer 1: theme inputs

Theme inputs are private to the theme resolver. They are the small customizable
set represented by `surface`, `ink`, `accent`, `contrast`, fonts, and semantic
colors. Components must not read them directly.

### Layer 2: semantic application tokens

The current CSS variables are the canonical semantic vocabulary:

| Token                | Meaning                               | Usage rule                                             |
| -------------------- | ------------------------------------- | ------------------------------------------------------ |
| `--canvas`           | Default window and content background | Owns every full-area surface except the Space Explorer |
| `--lite-sidebar`     | Persistent Explorer background        | Use only inside `.space-sidebar` and its native states |
| `--sidebar-strong`   | Stronger Explorer-local state         | Never use as a general card background                 |
| `--surface`          | Overlay or grouped-surface base       | Defaults to `--canvas`; elevation comes from context   |
| `--surface-hover`    | Hovered neutral row/control           | Temporary interaction state only                       |
| `--surface-selected` | Selected/current item                 | Must remain visibly distinct in both variants          |
| `--ink`              | Primary text and icons                | Body text, labels, active icons                        |
| `--ink-muted`        | Secondary information                 | Descriptions, metadata, inactive icons                 |
| `--ink-faint`        | Tertiary information                  | Hints and low-priority decoration only                 |
| `--line`             | Component boundary                    | Group rows, input borders, strong separators           |
| `--hairline`         | Quiet structural separator            | Title bars, workbars, split panes                      |
| `--lite-accent`      | Brand/accent role                     | Selection emphasis, links, active controls             |
| `--accent-strong`    | High-contrast accent foreground       | Accent text and icons, not large fills                 |
| `--focus`            | Keyboard focus                        | The only source for focus rings                        |
| `--control-fill`     | Native-like control fill              | Inputs, segmented selections, compact buttons          |
| `--control-border`   | Native-like control edge              | Form controls only                                     |
| `--success`          | Successful or added state             | Sync success, additions, completed operations          |
| `--warning`          | Caution or modified state             | Recoverable attention and changed metadata             |
| `--danger`           | Error, destructive, or removed state  | Failures, deletion, removals                           |

Primary actions, scrollbars, shadows, and component-library adapter variables
are derived from these semantic tokens. They are not additional customizable
palette fields.

### Layer 3: component adapters

Shared libraries keep their public token names, but Eidos Lite maps them at one
boundary:

- Shadcn/Tailwind tokens such as `--background`, `--foreground`, `--border`,
  and `--ring` are mapped under `[data-eidos-file-root]`.
- Pierre tree roles map to the Eidos semantic state and status tokens.
- Text/code editor theme selection comes from the resolved code-theme pair,
  not from component-local media queries.
- Portals inherit the resolved root theme and must use `--surface`, `--ink`,
  `--line`, and `--focus` rather than library defaults.

## Canonical Eidos palette

These are the built-in v1 values. They are encoded in OKLCH to keep perceptual
relationships stable; future user-authored themes may enter as sRGB hex and be
converted by the resolver.

The default direction is a white content canvas with cool graphite neutrals
and a restrained cyan accent. White is an explicit product choice for the
light canvas; tinted grays provide structure in the Explorer and interaction
states. The dark palette avoids pure black, and both variants keep cyan rare
enough to preserve its meaning.

| Role             | Light                    | Dark                     |
| ---------------- | ------------------------ | ------------------------ |
| Canvas           | `oklch(1 0 0)`           | `oklch(0.17 0.012 230)`  |
| Explorer         | `oklch(0.965 0.008 220)` | `oklch(0.195 0.014 230)` |
| Explorer strong  | `oklch(0.925 0.014 220)` | `oklch(0.235 0.02 230)`  |
| Ink              | `oklch(0.2 0.012 230)`   | `oklch(0.92 0.008 220)`  |
| Muted ink        | `oklch(0.45 0.012 230)`  | `oklch(0.72 0.012 220)`  |
| Faint ink        | `oklch(0.54 0.01 230)`   | `oklch(0.64 0.01 220)`   |
| Accent           | `oklch(0.5 0.105 210)`   | `oklch(0.74 0.095 205)`  |
| Selected         | `oklch(0.925 0.04 210)`  | `oklch(0.285 0.045 210)` |
| Success / added  | `oklch(0.46 0.12 150)`   | `oklch(0.74 0.11 150)`   |
| Warning          | `oklch(0.48 0.11 75)`    | `oklch(0.78 0.1 75)`     |
| Danger / removed | `oklch(0.51 0.16 25)`    | `oklch(0.72 0.14 25)`    |

The default surface is deliberately close to neutral. A new product status
color must represent a reusable semantic role; it must not be introduced only
to decorate one module.

## Surface and border rules

| Surface                           | Background                  | Boundary                                           |
| --------------------------------- | --------------------------- | -------------------------------------------------- |
| Window, editor, Settings, Welcome | `--canvas`                  | None by default                                    |
| Title bar and workbar             | Transparent over `--canvas` | One `--hairline` edge when separation is necessary |
| Space Explorer                    | `--lite-sidebar`            | One `--hairline` split-pane edge                   |
| Settings navigation               | `--canvas`                  | One `--hairline` split-pane edge                   |
| Settings group                    | `--surface`                 | One `--line` outline; no outer card wrapper        |
| Popover and menu                  | `--surface`                 | `--line` plus one restrained elevation shadow      |
| Modal dialog                      | `--surface`                 | `--line` plus stronger overlay elevation           |

Do not stack a tinted parent, a card, and bordered child rows. One component
owns each surface. If alignment and spacing can express a relationship, no
border is needed.

`--line` uses 52% alpha and `--hairline` uses 42% alpha in the canonical theme.
Controls may use a stronger 72% edge. These ratios are defaults, not permission
to reduce contrast below a visible structural boundary.

## Interaction states

Every interactive component must define the same state vocabulary:

- **Rest:** primary or muted ink on its owning surface.
- **Hover:** `--surface-hover`; no layout shift.
- **Selected/current:** `--surface-selected` plus primary ink.
- **Pressed:** a stronger local fill or 1 px translation, never both for a
  dense row.
- **Keyboard focus:** a visible ring derived only from `--focus`; focus must not
  rely on hover or selection.
- **Disabled:** preserve legibility, remove hover behavior, and expose disabled
  semantics. Opacity is supplementary.
- **Modified/dirty:** use a compact marker and accessible label or tooltip. The
  marker must not be confused with error or sync-failure status.
- **Error/destructive:** use `--danger` with text or iconography.

Transitions should be 80–160 ms and limited to color, opacity, or small
transforms. When reduced motion resolves to `on`, nonessential transitions and
all decorative animation are removed.

## Typography

- The platform UI stack is the default:
  `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue",`
  `"Segoe UI Variable", "Segoe UI", sans-serif`.
- UI font customization replaces the front of that stack and retains platform
  fallbacks.
- Code and text-file editor surfaces use the configured code font, followed by
  `"SFMono-Regular", Consolas, "Liberation Mono", monospace`.
- The canonical compact UI size is 13 px; the canonical code size is 13 px.
  User-configurable font-size controls, if added, must be bounded and must not
  alter control heights independently of density tokens.
- Use weight and spacing before color to establish hierarchy. Uppercase
  eyebrow labels are reserved for compact section headings.

## Editor and diff contract

Chrome theme and syntax theme are separate but resolved by the same appearance
state. The selected code theme must provide editor background, foreground,
selection, cursor, gutter, and syntax roles that agree with the resolved chrome
variant.

- Markdown text editing hides line numbers; other recognized code languages
  show line numbers.
- The editor background must visually join `--canvas`. It must not retain the
  previous light/dark background after a theme switch.
- A mounted editor receives theme updates in place. Theme changes do not reload
  file content or alter dirty state.
- Diff added and removed colors come from the theme semantic colors. If the
  selected marker style is `symbols`, `+` and `-` remain present in addition to
  color.
- Syntax colors are editor-theme responsibilities. Application chrome must not
  duplicate individual syntax tokens.

## Accessibility gates

- Primary text must meet WCAG 2.2 AA contrast against its owning surface.
- Muted text must meet AA when it communicates required information. Faint ink
  is limited to optional hints and decoration.
- Focus indication must remain visible against canvas, Explorer, selected, and
  overlay surfaces.
- Selected, dirty, added, removed, warning, and error states must remain
  identifiable without color.
- Theme previews and custom theme import must reject invalid color syntax and
  warn before accepting combinations that fail the primary text or focus gates.
- High-contrast operating-system preferences may increase neutral separation;
  they must not replace the chosen accent or syntax theme.

## Implementation and review rules

1. Add or change built-in palette values only in the root theme declarations.
2. New components use semantic variables. Raw hex, RGB, HSL, or OKLCH values
   outside the theme layer require a documented, component-local data-color
   reason.
3. Reusable status tones are promoted to a root semantic token instead of
   copied between selectors or React style objects.
4. Test both explicit variants and System mode. A System test must include an
   operating-system change while the window is open.
5. Theme-switch tests must cover application chrome, Eidos File UI, text/code
   editor, diff surface, portals, and retained dirty drafts.
6. Visual review covers normal, hover, selected, focus, disabled, dirty,
   warning, and error states in both variants.
7. Custom-theme import/export, font selection, contrast controls, translucent
   chrome, and code-theme pickers remain separate features. They must implement
   this contract rather than expanding component-level styling APIs.

Existing raw status colors are migration debt, not precedents. Refactor them
into semantic roles when their owning component is next changed; do not perform
a broad mechanical replacement without visual verification.
