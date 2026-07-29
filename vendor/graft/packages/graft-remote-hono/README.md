# `@eidos.space/graft-remote-hono`

Hono routing adapter for `@eidos.space/graft-remote`.

The adapter maps Hono route parameters and `Context` into the framework-neutral
Graft protocol engine. Protocol behavior, backend interfaces, authentication,
and authorization types are re-exported from the core package.

## Install

```bash
npm install @eidos.space/graft-remote-hono hono
```

## Use

```ts
import { Hono } from "hono";
import {
  GraftProtocolError,
  createGraftRemote,
} from "@eidos.space/graft-remote-hono";

type AppEnv = {
  Bindings: {
    REPOSITORIES: RepositoryStore;
  };
};

interface User {
  id: string;
}

const app = new Hono<AppEnv>();
const remote = createGraftRemote<AppEnv, User>({
  async authenticate({ request }) {
    const user = await authenticateRequest(request);
    if (user === null) {
      throw new GraftProtocolError(401, "unauthorized", "Authentication required", {
        "WWW-Authenticate": 'Bearer realm="graft"',
      });
    }
    return user;
  },

  async authorize({ action, principal, repository }) {
    if (principal === undefined || !(await canAccess(principal, action, repository))) {
      throw new GraftProtocolError(403, "forbidden", "Repository access denied");
    }
  },

  backend({ adapterContext, repository }) {
    return adapterContext.env.REPOSITORIES.open(repository.id);
  },
});

app.get("/health", (context) => context.text("ok"));
app.route("/graft", remote);

export default app;
```

This serves `https://example.com/graft/acme/archive` without intercepting
unrelated Hono routes. Export `remote` directly for Git-like URLs rooted at
`https://example.com/acme/archive`.

Set `legacyRoutes: true` to retain the early
`/api/graft/v1/repos/:namespace/:repository` compatibility alias.

`@eidos.space/graft-remote-cloudflare` supplies the reusable R2 and SQLite
Durable Object backend. The service under `services/graft-remote-cloudflare`
composes all three packages for deployment and end-to-end verification.
