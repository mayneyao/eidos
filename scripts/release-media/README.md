# Local release media

Prepare, record, review and upload a short Eidos Lite demonstration on macOS.
The first scenario demonstrates the table-search Escape/focus improvement from
Lite 0.31.0, captured with the unchanged shared UI in 0.31.1. This is a real
development app using the canonical Runtime and a synthetic project fixture.
It is not proof of the signed release package or of mobile capture.

Requirements: macOS 15+, Xcode command-line tools, Node 22+ with WebSocket and
parseEnv support, FFmpeg/ffprobe, workspace dependencies, Screen Recording and
Accessibility permission for the local tool host. Capture uses ScreenCaptureKit
to retain the native app window and 32 logical points of actual desktop on every
side; other applications are excluded from the recording. Native mouse and
keyboard events perform the interaction. CDP reads the real UI and asserts focus
and search-result state without injecting application data or rendered results.

## Prepare and launch

From the product repository root:

```bash
node scripts/release-media/prepare.mjs --out "$PWD/.artifacts/release-media"
EIDOS_LITE_DEV_USER_DATA="$PWD/.artifacts/release-media/profile" \
EIDOS_LITE_CAPTURE_CDP_PORT=9237 pnpm dev:eidos-lite
```

The opt-in CDP port works only with the development server and an explicit
absolute isolated profile. It does not enable debugging in packaged builds.
If 5179 is occupied, inspect its owner and arrange a serial handoff; never stop
or attach to another checkout. Launch development UI only through this command.

In this isolated app, use Open Space to select the prepared `Release Demo`
directory, then open `Projects.eidos`. Do not choose a personal Space. Keep the
app available for a roughly 20-second foreground interaction. The recorder
checks the exact Space path, app process, checkout and localhost:5179 document.

## Record and review

Get the Electron PID listening on the explicit debug port, then record:

```bash
node scripts/release-media/capture.mjs \
  --pid "$(lsof -nP -t -iTCP:9237 -sTCP:LISTEN)" \
  --out "$PWD/.artifacts/release-media"
```

The script compiles the two local Swift helpers. It fixes the demo window at
1200×820 logical points, includes 32-point desktop padding, records native
pointer movement and keyboard actions, checks both search results and repeated
Escape focus recovery, verifies fixture bytes remain unchanged, then writes:

- `demo.mp4`: H.264, 30fps, no audio, faststart, original padding retained.
- `poster.webp`: a successful search result frame.
- `source.manifest.json`: private provenance, exact capture version, scenario,
  seed checksum, dimensions, tooling changes and assertion evidence.
- `source-<timestamp>.mp4`: private raw recording; never uploaded by this tool.

Input stops if the intended app loses foreground focus. Any failed assertion or
recording finalization fails the run; an incomplete video is never publishable.
Review the entire video and poster for readability, privacy and accurate
behavior. Then explicitly bind approval to those exact file hashes:

```bash
node scripts/release-media/review.mjs --dir "$PWD/.artifacts/release-media" --approve
```

This records local editorial approval; it does not upload or claim that a
particular human reviewed the files. Any subsequent byte change requires review.

## Upload and reference

`config.json` contains only public deployment identifiers. The dedicated
`eidos-media` R2 Standard bucket serves `https://media.eidos.space`, with TLS 1.2+
and GET/HEAD CORS for public assets. The R2 development URL stays disabled.
`infrastructure.json` records the provisioned public identifiers and exact
configuration. Its Cache Rule matches only `media.eidos.space/releases/`,
respects the uploaded origin cache headers and does not store 4xx/5xx responses.
Other hostnames and account-service routes are outside that rule.

Credentials come from `CLOUDFLARE_R2_API_TOKEN` (or `CLOUDFLARE_API_TOKEN`) or an
explicit ignored env file using `--credentials-file`. Existing local R2
authorization can be reused; credentials are never printed, copied into the
repository, embedded in footage or uploaded. The script uses the workspace's
Wrangler from `apps/download`; `--wrangler` accepts another installed CLI path.

Dry run first, then upload only the two allowlisted reviewed files:

```bash
node scripts/release-media/upload.mjs --dir "$PWD/.artifacts/release-media"
node scripts/release-media/upload.mjs --dir "$PWD/.artifacts/release-media" \
  --upload --credentials-file /absolute/path/to/ignored-credentials-file
```

Keys include release, scenario and a hash of the complete video/poster bundle.
Existing identical objects are reused. Differing content at an immutable URL
fails. After upload, the script reads back exact public bytes, MIME/cache headers
and a 206 Range response; `published-media.json` provides the media entry for
the existing website changelog model. Raw files, seed data, private manifest
and credentials are never uploaded. Big video files do not enter Git.

For a subsequent recording of an already opened demo, rerun `capture.mjs`
directly. `prepare.mjs` deliberately refuses to replace an existing fixture
whose bytes changed since the original copy; use a fresh output directory for
a fresh seed. The capture independently verifies its own before/after bytes.

Object existence checks use the authenticated R2 API. Do not probe missing
objects through the public media URL before uploading: the CDN can cache that
404 and temporarily hide a newly uploaded object. Public reads start only
after upload, and the public verification includes a real 206 Range response.

Pass the generated `media` object to the website owner for the matching
`releaseTag` entry. It includes bilingual feature/alt/caption and actual
width/height/duration. The caption explicitly identifies the newer capture
version. This script does not rewrite website data, deploy the account service,
create release tags or edit published release-note bodies.

Checks:

```bash
node --test scripts/release-media/upload.test.mjs
pnpm --filter @eidos.space/eidos-lite-desktop typecheck
```

Android and iOS simulator capture remain separate future scene adapters. This
initial implementation deliberately proves one real Desktop-to-media-to-log
chain on the local Mac.
