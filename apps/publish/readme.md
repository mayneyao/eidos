# Eidos Publish

We reused most of the code from apps/web-app, with only layout differences. Publish is a read-only site, also known as `ink` mode. It reads data from a remote database instead of a local sqlite database. see: [lib/sqlite/channel/readme.md](../../lib/sqlite/channel/readme.md)

## Dev

```bash
pnpm build:cf-worker
pnpm dev:ink
```

Note: there is no hot reload for ink mode, you need to run `pnpm build:cf-worker` and `pnpm dev:ink` again when you make changes to the `apps/publish/_worker.ts` code.

## Build & Preview

```bash
pnpm build:ink
```

```bash
npx wrangler pages dev dist --compatibility-flags="nodejs_compat"
```
