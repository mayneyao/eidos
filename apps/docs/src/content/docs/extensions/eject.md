---
title: Eject
description: Export built-in extensions to customize them.
sidebar:
  order: 4
---

**Eject** lets you export built-in extensions (like Journal, Monaco Editor) to user-space so you can edit and customize them.

## How It Works

Built-in extensions run directly in the app for best performance. When you eject one:

1. Its TypeScript source code is extracted
2. Compiled to JavaScript
3. Saved as a regular user extension with the `ejected/` prefix

## Example: Customizing Journal

Let's say you want to customize the built-in **Journal** extension:

1. Go to **Settings** → **Extensions**
2. Find **Journal** and click **Eject**
3. Now you'll see `ejected/journal/index` in the extensions list
4. Click to preview it — it works just like the original Journal
5. Edit the code to customize (change styles, add features, etc.)
6. **Pin it** — Add your ejected Journal to the left sidebar tabs as a quick entry point
7. Your customized Journal now appears in the sidebar alongside the default one

:::note
Both versions coexist. The default Journal remains unless you go to Settings → Extensions and disable it.
:::

## Multi-File Extensions

Some extensions (like Journal) have multiple files. Each file becomes a separate extension:

- `ejected/journal/index` — main component
- `ejected/journal/use-journals` — dependency
- `ejected/journal/utils` — utilities

## Important Notes

|                 | Built-in | Ejected                     |
| --------------- | -------- | --------------------------- |
| **Editable**    | ❌ No    | ✅ Yes                      |
| **Performance** | Native   | Slight sandbox overhead     |
| **Updates**     | Auto     | Manual (re-eject to update) |
| **Runs in**     | Main app | iframe sandbox              |

:::caution
Once ejected, the extension won't receive automatic updates. To get updates, delete it and re-eject.
:::

## Use Cases

- **Customize** — Change styles, add features to Journal
- **Learn** — Study how Monaco Editor works
- **Fork** — Build your own version of Media Preview

## Troubleshooting

**"Already Ejected" error** — Delete the existing ejected extension first.

**Which version is used?** — Both extensions are available. For some extension types (like File Handlers), you may see both options. Disable the built-in one if you only want your customized version.

**View source code** — You can browse the source code of all built-in extensions at [github.com/mayneyao/eidos/tree/dev/extensions](https://github.com/mayneyao/eidos/tree/dev/extensions)
