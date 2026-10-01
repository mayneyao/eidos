# Eidos Publish Files 1.0

Status: staging implementation profile. Canonical language: English.

This Adapter/UI profile defines hosted ordinary files and plugin file Views.
It adds no Eidos File Format or Runtime semantics.

## Resource and snapshot

A Publication slug identifies one stable URL and one active immutable Version.
The same local file MAY have multiple Publications with different slugs.
The File Driver is `org.eidos.driver.file@1.0`; its bundle media type is
`application/vnd.eidos.file`. The entrypoint's own media type describes the
original bytes. Existing Eidos, Markdown and Form Drivers are unchanged.

The `eidos.publish/source-bundle@1` manifest retains its existing required
fields. File bundles MUST contain one entrypoint and no attachments or asset
references. Raw files have no presentation field. A plugin View adds:

```json
"presentation": {
  "kind": "plugin-view",
  "pluginPath": "plugins/view.eidos-plugin",
  "viewId": "map"
}
```

Exactly one file with role `plugin` MUST identify that path. Other Drivers MUST
reject presentation and plugin roles. The entire canonical manifest, including
View identity, dependency digest, source name and source digest, determines the
Version fingerprint. Plugin bytes are tenant-scoped content-addressed objects
and count toward storage; they are not separate public catalog entries.
Publishing identical bundles MUST reuse the existing active Version.

## Access and presentation

Without presentation, GET/HEAD on the stable Publication URL MUST serve the
original file with attachment disposition and its original basename. Range
requests MUST retain existing Gateway behavior. The stable URL MUST NOT use
immutable caching. Unknown, HTML and script file types MUST NOT execute.

With presentation, the stable URL serves the selected interactive View.
The server MUST verify a bounded format-2 package, a plugin API requirement of exactly
3.0.0, and a selected read-only ordinary-file View. This initial profile does
not support document/Eidos capabilities, local workspace access, connections,
settings or persistent plugin storage. Source files and plugin packages are
each limited to 16 MiB for View publication, including a 16 MiB decompressed
package limit. Raw files retain the existing 1 GiB object ceiling and account
limits. Free remains Markdown-only.

The browser MUST execute plugin code inside an opaque sandboxed iframe with
scripts enabled and same-origin authority disabled. Only declared browser
network origins and worker support are allowed. Eidos account/publication
origins are forbidden network destinations. The parent MUST bind RPC to that
iframe and the exact published file. Reads, stat, URL and inert snapshot watches
are supported; writes, directory enumeration and other host capabilities fail.
Bound-file operations MUST accept the filename relative to the bound file's
directory, including `./filename`. The bundle entrypoint path remains an
accepted alias. These aliases MUST resolve only the published file; other
directories and parent traversal MUST be rejected.
File bytes MUST pass size and SHA-256 verification before reaching the View.

Source download and View page access MUST use the Publication's current
public/password/private policy. Plugin dependency download MUST NOT be exposed
by the public file route. Browser execution necessarily delivers selected View
code to authorized viewers; this is not code secrecy.

Local edits, plugin upgrades and uninstallation MUST NOT change an active
Version. Republish explicitly to change content or presentation. Version-bound
file URLs resolve only the active Version and do not promise permanent history.
Unpublish, retention, quota and account downgrade rules remain applicable.

## Conformance

`EP-File-1.0` requires raw download/HEAD/Range tests, dependency membership and
fingerprint tests, plugin capability rejection, public-route dependency
isolation, protected-source access, and real-browser sandbox file reads.
