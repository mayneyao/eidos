import {
  createGraftRemoteHandler,
  type GraftRemoteOptions,
  type GraftRouteParameters,
} from "@eidos.space/graft-remote";
import { Hono, type Context, type Env } from "hono";

export * from "@eidos.space/graft-remote";

export type GraftHonoOptions<E extends Env = Env, Principal = undefined> =
  GraftRemoteOptions<Context<E>, Principal> & {
    legacyRoutes?: boolean;
  };

export function createGraftRemote<E extends Env = Env, Principal = undefined>(
  options: GraftHonoOptions<E, Principal>,
): Hono<E> {
  const app = new Hono<E>();
  const handle = createGraftRemoteHandler<Context<E>, Principal>(options);
  const handler = (context: Context<E>): Promise<Response> =>
    handle({
      request: context.req.raw,
      route: context.req.param() as GraftRouteParameters,
      adapterContext: context,
    });

  if (options.legacyRoutes === true) {
    registerRepositoryRoutes(app, "/api/graft/v1/repos", handler);
  }
  registerRepositoryRoutes(app, "", handler);
  return app;
}

function registerRepositoryRoutes<E extends Env>(
  app: Hono<E>,
  prefix: string,
  handler: (context: Context<E>) => Promise<Response>,
): void {
  app.all(`${prefix}/:namespace/:repository`, handler);
  app.all(`${prefix}/:namespace/:repository/:operation`, handler);
  app.all(`${prefix}/:namespace/:repository/:operation/:objectPath{.+}`, handler);
}
