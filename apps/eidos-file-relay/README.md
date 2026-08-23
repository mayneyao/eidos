# Eidos File Relay

This Cloudflare Worker is the optional remote transport for `eidos serve`.
Local and LAN serving remain account-free and do not depend on this service.

The control plane accepts an Eidos OAuth access token, resolves only the OIDC
`sub` claim through the `EIDOS_ACCOUNT` service binding, and returns:

- one stable, opaque `r-<hash>.eidos.ink` hostname per account;
- one short-lived, single-use connector ticket for the CLI; and
- either account-authorized browser access or an explicit fragment-key guest
  share.

The CLI opens an outbound WebSocket to the account's SQLite Durable Object.
Browser HTTP requests are multiplexed over that socket to the loopback Serve
origin. The OAuth token never enters the browser URL, WebSocket protocol, local
Eidos File, logs, or Durable Object storage. A new claim replaces the previous
connector, so one account hostname has one authoritative local Runtime writer.

Account access is the default. An unauthenticated browser is sent through the
first-party `relay.eidos.ink` OIDC client on eidos.space. The central callback
exchanges the PKCE code, and the Durable Object accepts it only when the OIDC
`sub` matches the account that claimed the hostname. A short-lived, single-use
ticket then establishes a host-only `Secure`, `HttpOnly`, `SameSite=Strict`
browser cookie on the public `r-<hash>.eidos.ink` host. The central callback
never sets a cross-site session cookie.

The CLI requests guest capability access only for `eidos serve --relay
--share`. In that mode, the fragment key is exchanged for the same kind of
host-only browser session and is never sent in normal HTTP requests. Empty
legacy claim bodies retain share behavior so older released CLIs continue to
work during rollout.

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
and `r-<hash>.eidos.ink` for browser traffic. Staging uses
`relay-staging.eidos.ink` and `r-<hash>-staging.eidos.ink`, which stays within
the existing `*.eidos.ink` Universal SSL certificate. Deployments require the
shared wildcard DNS route owned by Eidos Publish. Publish dispatches the reserved
`r-` namespace to Relay through a service binding; Relay itself owns only the
exact control domain. The `EIDOS_ACCOUNT` service binding is also required.
