# `@eidos.space/graft-remote-cloudflare`

Cloudflare storage and authentication adapters for
`@eidos.space/graft-remote`.

This package contains the reusable Cloudflare-specific layer:

- `CloudflareRepositoryBackend` stores immutable objects in R2 and
  transactional metadata in a SQLite Durable Object;
- `RepositoryDurableObject` implements atomic create, CAS, CAD, and listing;
- `requireBearerToken` performs timing-safe bearer-token verification.

It does not create routes or export a Worker application. Use
`@eidos.space/graft-remote-hono` for Hono routing, or connect the backend to
another adapter.

## Install

```bash
npm install \
  @eidos.space/graft-remote-cloudflare \
  @eidos.space/graft-remote-hono \
  hono
```

## Compose a Worker

Generate the Worker `Env` from `wrangler.jsonc` with `wrangler types`, then pass
the generated bindings explicitly:

```ts
import { createGraftRemote } from "@eidos.space/graft-remote-hono";
import {
  CloudflareRepositoryBackend,
  GraftProtocolError,
  RepositoryDurableObject,
  requireBearerToken,
} from "@eidos.space/graft-remote-cloudflare";

export { RepositoryDurableObject };

type AppEnv = { Bindings: Env };

export default createGraftRemote<AppEnv>({
  async authenticate({ request, adapterContext }) {
    const token = adapterContext.env.GRAFT_REMOTE_TOKEN;
    if (!token) {
      throw new GraftProtocolError(503, "service_not_configured", "Token is not configured");
    }
    await requireBearerToken(request, token);
    return undefined;
  },

  backend({ adapterContext, repository }) {
    return new CloudflareRepositoryBackend(
      {
        objects: adapterContext.env.OBJECTS,
        repositories: adapterContext.env.REPOSITORIES,
      },
      repository.id,
    );
  },
});
```

The host Worker owns binding names, secrets, authentication policy, and routing.
The package never calls the Cloudflare REST API; it uses R2 and Durable Object
bindings directly and streams immutable request and response bodies.

See `services/graft-remote-cloudflare` for a deployable verification service,
Wrangler configuration, and end-to-end Workers runtime tests.
