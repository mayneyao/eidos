# Eidos documentation

This Astro/Starlight site is the unified documentation for Eidos Lite, Eidos
CLI, Eidos File development, and the Eidos File specifications. It is published at
[docs.eidos.space](https://docs.eidos.space).

## Information architecture

The top navigation has four product modules. Each module progresses from setup
to basics and then advanced use:

1. **Eidos Lite** — installation, local Space workflows, history, Sync, Publish,
   and troubleshooting;
2. **Eidos CLI** — installation, basic file commands, automation, Serve, and
   Publish;
3. **Build with Eidos File** — package installation, Runtime and Host basics,
   shared UI, and custom views;
4. **Eidos File Specs** — reading order, core contracts, integration contracts,
   and extended specifications.

The Web Editor remains a documented installation-free way to open one Eidos
File, but it is not a separate top-level module.

English and Simplified Chinese foundation pages are maintained as pairs.

## Sources of truth

- User and developer guides live in `apps/docs/src/content/docs`.
- Normative English specifications remain in `docs/specs`. The docs build runs
  `scripts/sync-specs.mjs` to create ignored site copies for navigation and
  search; generated files must not be edited.
- English specification text is normative. Chinese specification pages are
  informative translations.
- Retired all-in-one Desktop documentation belongs to the `legacy/0.32` branch.
  Current pages must not restore legacy Nodes, Extensions, Relay, or application
  APIs as active product behavior.
- Internal release runbooks and operational credentials stay in the repository;
  they are not public documentation content.

## Commands

Run from the repository root:

```bash
pnpm dev:docs
pnpm --filter docs typecheck
pnpm build:docs
pnpm deploy:docs
```

`typecheck` validates bilingual foundation coverage, internal routes, the spec
generation contract, and Astro/MDX diagnostics. `build` additionally checks
the generated HTML, every internal link and referenced fragment, all twelve
specification routes, and the production search index input.

## Writing rules

- Lead with a reader outcome, then explain the model behind it.
- Mark availability honestly. A roadmap feature is not an install instruction.
- Prefer executable commands and name the expected result.
- State where data lives, when it becomes durable, and what recovery does not
  replace.
- Link behavior claims to the owning specification instead of redefining them.
- Use Runtime or CLI as the write boundary; do not teach raw SQLite mutation.
- Remove retired routes from the public site and update current links to their canonical URLs.
