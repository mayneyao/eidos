# Release demo media

Read `scripts/release-media/README.md` and the actual scene, recorder, review
and uploader in the selected checkout. Use this reference for authentic Lite
demos, shortcut annotations and their release-changelog handoff.

## Order and ownership

Select media-worthy changes before drafting scenes. Use release demos for new
features or substantial user workflows; routine bug fixes remain text unless
the user explicitly requests a video. A tooling pilot does not automatically
belong in public release notes. Removing its changelog reference does not
authorize deleting the original footage or published media objects.

For a release with media:

1. Assess release impact and public baselines. Choose the intended version and
   draft evidence-backed English and Chinese release notes.
2. Validate the feature candidate. Prepare real scenes, synthetic fixtures and
   an isolated profile; freeze the feature/capture SHAs and actual app version.
3. Record real native interactions and their shortcut timings. Produce the
   final video with the bottom shortcut labels described below.
4. Watch the complete annotated video at normal speed, inspect its poster and
   verify behavior, privacy, encoding, actual dimensions/duration and unchanged
   fixtures. Approve the exact final video/poster hashes.
5. Upload those files to the existing media service; verify public bytes,
   MIME/cache/CORS and HTTP 206 Range playback.
6. Backfill the verified URLs and media metadata into the matching website
   changelog candidate. Finalize app notes, review all required languages and
   preview desktop/narrow layouts and actual playback.
7. Follow the surface runbook to merge the release PR, tag and verify public
   product artifacts. Complete the website entry with the actual publication
   timestamp and sources, verify and deploy it, then check the public pages.

The first notes pass defines what to demonstrate; the second integrates
verified media. Local reviewed footage alone does not complete a release with
media. An explicitly local-only task stops at reviewed files and a handoff
manifest; do not upload, bump versions, tag or deploy for that scope.

Keep the target release distinct from `capturedAppVersion`, build kind and
`sourceCommit`. A development capture does not prove the final signed package.
Locate the current owning eidos.space checkout and read its `AGENTS.md` and
`docs/changelog-maintenance.md` before editing website data.

## Standard macOS recording profile

`scripts/release-media/capture-profile.mjs` is the executable source of these
defaults (`lite-macos-2528x1768-v1`). Mobile capture needs its own adapter.

| Setting                   | Required value                                                                  |
| ------------------------- | ------------------------------------------------------------------------------- |
| Native app window         | 1200 × 820 logical points                                                       |
| Real desktop padding      | 32 logical points on each side                                                  |
| Captured rectangle        | 1264 × 884 logical points                                                       |
| Display scale             | 2×; verify before recording                                                     |
| Final video and poster    | 2528 × 1768 pixels, original aspect ratio                                       |
| Container / video codec   | MP4 / H.264 (`libx264`)                                                         |
| Encoding quality          | CRF 18, preset `medium`                                                         |
| Pixel format / frame rate | `yuv420p`, constant 30fps                                                       |
| Playback / audio          | 1× original speed; no audio stream                                              |
| MP4 layout                | `-movflags +faststart`                                                          |
| Poster                    | Real successful frame from final MP4; WebP, quality 90                          |
| Shortcut text             | Horizontal center, Y=1620px, font size 50px                                     |
| Shortcut styling          | SF system font, white text, dark `#202327` box at 94% opacity, 14px box padding |
| Shortcut lifetime         | 1.5 seconds minimum, superseded immediately by a newer relevant key             |

The 32-point padding must be captured desktop, not fabricated framing. Preserve
the native window controls. Do not resize, crop the app, append a footer or add
audio during annotation. Run `fps=30` before frame-index-based label filters:
ScreenCaptureKit can produce variable-rate sources. Standard resampling may
repeat real frames; do not fabricate app states or pad a missing action with a
frozen ending. Verify actual duration and that all final actions were retained.

Use this encoding profile; the capture script also supplies its shortcut filter:

```bash
ffmpeg -i <raw.mp4> -vf fps=30 -an \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p \
  -r 30 -movflags +faststart <demo.mp4>
ffmpeg -ss <successful-frame-seconds> -i <demo.mp4> \
  -frames:v 1 -c:v libwebp -quality 90 <poster.webp>
ffprobe -v error -show_streams -show_format -of json <demo.mp4>
```

## Bottom shortcut labels

Use the standard macOS profile above for every new Lite demo, unless the user
explicitly requests another format. Record any exception in the manifest.

Show only shortcuts that explain the demonstrated feature or a meaningful
transition. For search, these include opening Files/Text search and Escape to
close it. Omit generic editing/setup keys such as Cmd/Ctrl+A, copy/paste and
ordinary text entry. Escape or Enter is relevant only when its action helps
explain this feature; do not label every key merely because it was pressed.

- Show the actual keys and a short description of the action, for example
  `Esc · Return to the grid` or `Esc · 返回网格`, in the video's intended
  language. Match the actual platform: macOS uses `⌘`, `⌥`, `⇧` as applicable;
  Windows/Linux use the actual `Ctrl`, `Alt`, `Shift` keys. Never substitute an
  equivalent shortcut that was not pressed.
- Maintain exactly one active label. Start it with the relevant shortcut and
  retain it for a configured minimum duration (default 1.5 seconds), even after
  key release. A new relevant shortcut immediately replaces the old label and
  starts its own duration; replacement takes precedence over the old minimum.
  Never stack, queue, or crossfade two labels into concurrent lines. Repeating
  a relevant shortcut refreshes its label and timer. Ignored generic keys do
  not replace, extend or otherwise change the active label.
- Center the single line in the bottom safe area of the original captured
  footage, within its existing frame. Preserve its dimensions/aspect ratio;
  do not append a black strip or enlarge the canvas for shortcut labels. Use
  a readable high-contrast treatment close to the footage's bottom edge, with
  a small inset, without hiding results or the native window controls. Honor
  the user's requested vertical position; do not move it far upward merely
  to avoid a player's transient hover controls.
- Include the labels in the final MP4 itself so downloaded and embedded copies
  retain them. A player-page overlay or release-note explanation alone does
  not satisfy the requirement.
- Derive label timing from the actual native-input log on the recording's time
  axis. Retain key/action and start/end timing evidence in the private capture
  manifest or a sidecar. Remap those times if trimming or speed changes occur;
  do not guess timestamps from the nominal scene duration.
- Keep the unannotated raw recording private. The labels are instructional
  annotations; they must accurately describe real captured actions and must
  not conceal failures or fabricate application behavior.

Prepare the annotation pipeline before recording. Existing capture tools do
not automatically satisfy this rule merely because they can inject native
keys. Inspect their output and add the necessary rendering step for the scene;
do not claim shortcut annotation support without checking the final MP4.

## Direct per-key timeline for new recordings

For every new recording, save actual native key-down and key-up events as they
are posted, including modifier presses/releases and ordinary typing. Do not
reconstruct new timelines later from scene dwell durations or assertions.
Keep generic keys in the private audit log but exclude them from the public
shortcut HUD. Do not retain the typed text itself in the event log.

The separate `capture-iteration.mjs` scene engine uses the same profile, native
clock, timeline and label renderer, retaining its scene/provenance guards.
Its scene keys opt into the HUD with `shortcutLabel`; generic keys and typing
stay unlabeled. `--validate-only` does not verify native timing or the final
video. Complete a real take and playback review before claiming acceptance.

The current native helpers and both capture scripts implement this contract:

- `record-desktop.swift` emits `RECORDING_CLOCK` with
  `DispatchTime.uptimeNanoseconds` at its recording-start callback, followed by
  `RECORDING_STARTED`. Buffer stdout by complete lines; never use receipt of an
  arbitrary stdout chunk or `Date.now()` as the authoritative key-time origin.
- `capture.mjs` creates a private `key-events-<capture-id>.jsonl` with that clock
  header. For recorded inputs, pass its absolute path through
  `EIDOS_MEDIA_INPUT_TIMELINE` and the origin through
  `EIDOS_MEDIA_RECORDING_START_NS`. Assign `EIDOS_MEDIA_KEY_LABEL` only to a
  feature-relevant scene action. The raw log still records unlabeled keys.
- `native-input.swift` records each actual keyboard post's start/end monotonic
  nanoseconds, phase, key code, active modifiers, target PID and relevance.
  Unicode typing records only its character index, not the typed content.
  New adapters must instrument all input sources; the existing log covers this
  native helper, not unobserved manual input or other automation helpers.
- Save `input-timeline-<capture-id>.json` with derived `relativeSeconds`, the
  original clock and events, selected single-line label intervals and profile
  ID. Validate monotonic order and balanced down/up pairs. Fail a take with
  missing, truncated or inconsistent timing instead of guessing replacements.
- The manifest's `inputTimeline` binds both files by SHA-256 and records the
  clock, event count and input scope. `shortcutAnnotations` records the actual
  label intervals, minimum duration, single-line replacement policy and no
  added canvas. Keep these private files out of uploads.

The clock origin is explicitly the native recording-start callback, not an
independently measured first-frame presentation timestamp. Verify alignment
in a pilot/full playback; retain a directly measured media offset if an adapter
needs one. Never silently infer an offset from a scene's intended duration.
Historical footage may retain an explicitly described retrospective alignment;
do not relabel it as a directly logged recording. New recordings must use the
direct timeline.

## Capture and review gates

Launch development Lite only with `pnpm dev:eidos-lite` from the selected
repository root. Before Computer Use selection, verify the port 5179 listener's
checkout, exact Electron executable/PID and `http://localhost:5179/` document.
Use an absolute isolated profile and the exact checkout's `Electron.app` path.
Do not attach to or stop an unrelated checkout to resolve a port/lock conflict.

Perform actions through native mouse/keyboard input; CDP may observe real
state, geometry and assertions. Preserve the native macOS traffic lights and
real desktop padding. Reject unexpected notifications/dialogs, private content,
failed assertions, focus loss or a missing final result. Check actual ffprobe
duration rather than wall-clock or planned duration, especially for VFR tails.

During full 1× playback, cross-check the feature-relevant actions against their
bottom labels: no missing/wrong keys, generic-key noise, early/late appearance,
clipping or obscured content. Verify the minimum duration, immediate replacement
by a newer relevant shortcut and at most one line in every frame. Confirm the
original geometry, no added bottom strip, and readability at actual embedded
playback size during normal playback. Inspect the full-resolution poster.
Automated assertions and storyboards supplement rather than replace playback.

Finish annotations before hash-bound approval:

```bash
node scripts/release-media/review.mjs --dir <final-take-directory> --approve
```

The current review script binds video/poster hashes; it does not itself verify
shortcut-label coverage or synchronization. Record that review separately.
Any later annotation, encoding or poster change requires review and new hashes.
Never upload an annotated derivative under the original file's approval.

## Upload and changelog handoff

Inspect the current uploader's scene metadata and copy. The original uploader
accepts stable `lite-vX.Y.Z` identities and contains search-scene-specific copy;
new scenes/prereleases need a supported adapter, not falsified manifest fields.
Dry-run before upload, using existing infrastructure and ignored credentials:

```bash
node scripts/release-media/upload.mjs --dir <final-reviewed-take-directory>
node scripts/release-media/upload.mjs --dir <final-reviewed-take-directory> \
  --upload --credentials-file <absolute-ignored-credentials-file>
```

Upload only the exact reviewed final MP4 and poster. Keep raw footage, fixtures,
private manifests and credentials local. Use immutable bundle-hash keys, reuse
identical bytes and verify public files plus Range responses. Adding labels to
already-published footage creates a new bundle/URL; never overwrite its old key.

Use `published-media.json.media` in the matching `releaseTag` entry's `media`
array in eidos.space `src/data/changelog.json`. Preserve actual dimensions,
duration, poster, provenance distinctions and translated feature/alt/caption
for every locale required by that checkout. Do not add false publication dates
for an unpublished release or modify Desktop Legacy's `src/data/releases.json`.
After product publication, use the real timestamp and tagged note sources,
run the website's changelog/source/locale/build gates and verify the deployed
pages and annotated video playback. Keep media, product and website publication
as separate reportable statuses, then clean up only task-owned processes.
