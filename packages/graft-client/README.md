# `@eidos.space/graft-client`

Transport-independent Graft repository client used by Eidos Desktop. It maps
the small repository command surface Eidos needs onto Graft's JSON PRAGMAs.

The package does not spawn the Graft CLI and does not depend on Electron,
`better-sqlite3`, or `@libsql/client`. Hosts provide a long-lived PRAGMA
executor and own native extension loading and connection lifetime.
