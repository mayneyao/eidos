# Eidos Publish [WIP]

We reused most of the code from apps/web-app, with only layout differences. Publish is a read-only site, also known as `ink` mode. It reads data from a remote database instead of a local sqlite database. see: [lib/sqlite/channel/readme.md](../../lib/sqlite/channel/readme.md)

## Dev

if you want to develop locally, you need to rename `wrangler-for-dev.toml` to `wrangler.toml` first. and `wrangler.toml` should be ignored by git. when deploy, config the binding in the cloudflare dashboard.

```bash
# build the worker
pnpm build:cf-worker

# start /api/server
npx wrangler pages dev dist --compatibility-flags="nodejs_compat" --local

pnpm dev:ink
```

Note: there is no hot reload for ink mode, you need to run `pnpm build:cf-worker` and `pnpm dev:ink` again when you make changes to the `apps/publish/_worker.ts` code.

## Build & Preview

```bash
pnpm build:ink
```

```bash
npx wrangler pages dev dist --compatibility-flags="nodejs_compat" --local
```

## deploy

`pages` now not support `durable_objects`, so we need to deploy a durable object worker first.

create a wrangler.toml for the durable object worker.

```toml
# this file is used for testing
name = "data-space-object"
main = "dist/_DataSpaceObject.js"
compatibility_date = "2023-05-18"
compatibility_flags = ["nodejs_compat"]

[[durable_objects.bindings]]
name = "DATA_SPACE"
class_name = "DataSpaceObject"

[[migrations]]
tag = "v1" # Should be unique for each entry
new_classes = ["DataSpaceObject"]

[[kv_namespaces]]
binding = "DOMAIN_DB_INFO"
id = "your kv namespace id"


```

build and deploy the durable object worker.

```bash
pnpm build:cf-worker-do
npx wrangler deploy
```

config the durable object binding in the cloudflare dashboard.
