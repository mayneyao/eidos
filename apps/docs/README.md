# Eidos Developer Documentation

This is the current documentation site for Eidos. It uses Astro and Starlight
and is published at [docs.eidos.space](https://docs.eidos.space).

The previous database-backed documentation is preserved in
`apps/legacy-docs` and published separately at
[legacy.docs.eidos.space](https://legacy.docs.eidos.space).

## Content principles

- Document the file-based Eidos architecture, not the legacy database model.
- Mark proposed or unavailable APIs as **Design preview**.
- Keep examples small, complete, and backed by files under `examples/`.
- Use stable headings and explicit links so developers and agents can navigate
  the documentation reliably.
- Update English and Simplified Chinese versions together for foundational and
  extension documentation.

## Commands

Run commands from the repository root:

| Command                  | Action                                       |
| ------------------------ | -------------------------------------------- |
| `pnpm dev:docs`          | Start the current documentation site         |
| `pnpm build:docs`        | Validate examples and build the current site |
| `pnpm dev:legacy-docs`   | Start the archived site                      |
| `pnpm build:legacy-docs` | Build the archived site                      |

## Agent entry points

- `/llms.txt` contains the canonical navigation map.
- `/llms-full.txt` contains the compact extension development contract.
- `/schemas/extension-manifest.schema.json` contains the machine-readable
  extension manifest schema.
