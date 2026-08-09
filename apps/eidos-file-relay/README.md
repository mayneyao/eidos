# Eidos File Relay

This Cloudflare Worker is the optional remote transport for `eidos serve`.
Local and LAN serving remain account-free and do not depend on this service.

The control plane accepts an Eidos OAuth access token, resolves only the OIDC
`sub` claim through the `EIDOS_ACCOUNT` service binding, and returns:

- one stable, opaque `u-<hash>.eidos.ink` hostname per account;
- one short-lived, single-use connector ticket for the CLI; and
- one fragment-only browser pairing key.

The CLI opens an outbound WebSocket to the account's SQLite Durable Object.
Browser HTTP requests are multiplexed over that socket to the loopback Serve
origin. The OAuth token never enters the browser URL, WebSocket protocol, local
Eidos File, logs, or Durable Object storage. A new claim replaces the previous
connector, so one account hostname has one authoritative local Runtime writer.

The initial preview buffers each browser request up to 4 MiB and streams origin
responses in bounded chunks. This covers normal editor operations and SSE
revision events; large snapshot/import transport remains a later protocol
extension.

## Local verification

```bash
pnpm install
pnpm --filter @eidos.space/eidos-file-relay types
pnpm --filter @eidos.space/eidos-file-relay check
pnpm --filter @eidos.space/eidos-file-relay test
pnpm --filter @eidos.space/eidos-file-relay dry-run:staging
```

Production uses `relay.eidos.ink` for authenticated control/WebSocket traffic
and `u-<hash>.eidos.ink` for browser traffic. Staging uses
`relay-staging.eidos.ink` and `u-<hash>-staging.eidos.ink`, which stays within
the existing `*.eidos.ink` Universal SSL certificate. Deployments require the
corresponding wildcard DNS/Worker route and the `EIDOS_ACCOUNT` service binding.
