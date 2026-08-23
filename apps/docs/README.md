# Eidos documentation

This Astro/Starlight site is the unified documentation for current Eidos File,
Eidos CLI, Web Editor, Eidos Lite, and Eidos Publish work. It is published at
[docs.eidos.space](https://docs.eidos.space).

## Information architecture

The top navigation follows what a reader is trying to do:

1. **Start here** — product chooser, Web/CLI quickstarts, Lite status, and core
   concepts;
2. **Use Eidos** — editing, data location, safety, history, recovery, Sync, and
   troubleshooting;
3. **CLI & automation** — JSON command behavior, the safe context → apply →
   validate workflow, local/Relay Serve, and hosted Publish;
4. **Build with Eidos** — integration decisions, Runtime/Host boundaries, and
   package references;
5. **Specifications** — searchable site pages generated from the normative
   specification source.

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
the generated HTML, every internal link and referenced fragment, all eight
specification routes, and the production search index input.

## Writing rules

- Lead with a reader outcome, then explain the model behind it.
- Mark availability honestly. A roadmap feature is not an install instruction.
- Prefer executable commands and name the expected result.
- State where data lives, when it becomes durable, and what recovery does not
  replace.
- Link behavior claims to the owning specification instead of redefining them.
- Use Runtime or CLI as the write boundary; do not teach raw SQLite mutation.
- Keep old URLs redirected to a truthful replacement or the legacy notice.
