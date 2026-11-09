import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  CAPTURE_PROFILE as profile,
  parseInputTimeline,
  buildShortcutIntervals,
  shortcutVideoFilter,
  validateVideoProfile,
} from "./capture-profile.mjs"

const clock = {
  type: "recording-start",
  clock: "DispatchTime.uptimeNanoseconds",
  monotonicNs: "9000000000000000",
}
const pair = (at, keyCode = 53, label = "Esc · Close search", kind = "key") =>
  ["down", "up"].map((phase, index) => ({
    type: "keyboard",
    kind,
    phase,
    keyCode,
    modifiers: [],
    postStartedNs: String(
      BigInt(clock.monotonicNs) + BigInt(Math.round((at + index * 0.04) * 1e9))
    ),
    postCompletedNs: String(
      BigInt(clock.monotonicNs) +
        BigInt(Math.round((at + index * 0.04) * 1e9)) +
        100n
    ),
    relevant: Boolean(label),
    ...(label ? { label } : {}),
  }))
const timeline = (...events) =>
  parseInputTimeline(
    [clock, ...events.flat()].map((x) => JSON.stringify(x)).join("\n")
  )

test("native timestamps retain nanosecond precision and become recording-relative times", () => {
  const parsed = timeline(pair(1.25))
  assert.equal(parsed.directNativeEvents, true)
  assert.equal(parsed.events[0].relativeSeconds, 1.25)
  assert.equal(parsed.events[1].relativeSeconds, 1.29)
  assert.equal(parsed.events[0].postStartedNs, "9000001250000000")
})

test("missing clocks, backwards events, partial keys and orphan releases fail closed", () => {
  assert.throws(
    () => parseInputTimeline(JSON.stringify({ events: [] })),
    /clock/
  )
  assert.throws(() => timeline([pair(1)[0]]), /unreleased/)
  assert.throws(() => timeline([pair(1)[1]]), /matching press/)
  assert.throws(() => timeline(pair(2), pair(1)), /monotonic/)
  const missingLabel = pair(1)
  delete missingLabel[0].label
  assert.throws(() => timeline(missingLabel), /scene label/)
})

test("Command+Shift records balanced modifiers while only the feature key produces a tip", () => {
  const event = (at, keyCode, phase, kind, modifiers, label) => ({
    ...pair(at, keyCode, label ?? null, kind)[phase === "down" ? 0 : 1],
    modifiers,
  })
  const parsed = timeline([
    event(0.1, 55, "down", "modifier", ["command"]),
    event(0.2, 56, "down", "modifier", ["command", "shift"]),
    event(0.3, 3, "down", "key", ["command", "shift"], "⌘ ⇧ F · Search files"),
    event(0.4, 3, "up", "key", ["command", "shift"], "⌘ ⇧ F · Search files"),
    event(0.5, 56, "up", "modifier", ["command"]),
    event(0.6, 55, "up", "modifier", []),
  ])
  assert.equal(parsed.events.length, 6)
  const intervals = buildShortcutIntervals(parsed, 90)
  assert.equal(intervals.length, 1)
  assert.deepEqual(intervals[0].modifiers, ["command", "shift"])
  assert.equal(intervals[0].label, "⌘ ⇧ F · Search files")
  assert.throws(() => timeline(parsed.events.slice(0, -1)), /unreleased/)
})

test("generic keys and typing are audited but never replace or extend the active tip", () => {
  const parsed = timeline(
    pair(0.2),
    pair(0.4, 0, null),
    pair(0.6, 0, null, "text")
  )
  const intervals = buildShortcutIntervals(parsed, 120)
  assert.equal(parsed.events.length, 6)
  assert.deepEqual(
    intervals.map((e) => [e.startFrame, e.endFrameExclusive]),
    [[6, 51]]
  )
})

test("a new relevant shortcut immediately replaces an unfinished tip, including repeats", () => {
  const intervals = buildShortcutIntervals(
    timeline(pair(0.2), pair(0.7), pair(1.2, 3, "⌘ F · Search")),
    120
  )
  assert.deepEqual(
    intervals.map((e) => [e.startFrame, e.endFrameExclusive]),
    [
      [6, 21],
      [21, 36],
      [36, 81],
    ]
  )
  assert.deepEqual(
    intervals.map((e) => e.preempted),
    [true, true, false]
  )
  for (let frame = 0; frame < 120; frame++)
    assert.ok(
      intervals.filter(
        (e) => frame >= e.startFrame && frame < e.endFrameExclusive
      ).length <= 1
    )
})

test("the last shortcut requires enough real recorded tail for its minimum duration", () => {
  assert.throws(
    () => buildShortcutIntervals(timeline(pair(1.5)), 60),
    /longer real tail/
  )
  assert.throws(
    () => buildShortcutIntervals(timeline(pair(1)), NaN),
    /frame count/
  )
})

test("new capture profile rejects changed geometry, frame rate, pixel format or audio", () => {
  const valid = {
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        pix_fmt: "yuv420p",
        r_frame_rate: "30/1",
        width: 2528,
        height: 1768,
      },
    ],
    format: { duration: "2.0" },
  }
  assert.doesNotThrow(() => validateVideoProfile(valid))
  for (const change of [
    { width: 1920 },
    { height: 2216 },
    { r_frame_rate: "60/1" },
    { pix_fmt: "yuv444p" },
  ])
    assert.throws(() =>
      validateVideoProfile({
        ...valid,
        streams: [{ ...valid.streams[0], ...change }],
      })
    )
  assert.throws(() =>
    validateVideoProfile({
      ...valid,
      streams: [...valid.streams, { codec_type: "audio" }],
    })
  )
})

test(
  "FFmpeg normalizes frame rate before single-line timed labels without adding canvas",
  {
    skip:
      process.platform !== "darwin"
        ? "The macOS profile uses the system SF font"
        : false,
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "eidos-media-profile-"))
    try {
      const textFile = join(directory, "literal tip.txt")
      const filterFile = join(directory, "filter.txt")
      const video = join(directory, "demo.mp4")
      const intervals = buildShortcutIntervals(timeline(pair(0.2)), 60)
      await writeFile(textFile, intervals[0].label)
      await writeFile(
        filterFile,
        `fps=${profile.fps},` + shortcutVideoFilter(intervals, [textFile])
      )
      execFileSync("ffmpeg", [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=0xeeeeee:s=2528x1768:r=10:d=2",
        "-filter_script:v",
        filterFile,
        "-an",
        "-c:v",
        "libx264",
        "-crf",
        String(profile.crf),
        "-preset",
        profile.preset,
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(profile.fps),
        "-movflags",
        "+faststart",
        video,
      ])
      const probe = JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            video,
          ],
          { encoding: "utf8" }
        )
      )
      validateVideoProfile(probe)
      assert.equal(Number(probe.streams[0].nb_frames), 60)
      const pixels = execFileSync("ffmpeg", [
        "-v",
        "error",
        "-i",
        video,
        "-vf",
        "select='eq(n,5)+eq(n,6)+eq(n,50)+eq(n,51)',crop=100:70:1214:1600,scale=1:1,format=gray",
        "-fps_mode",
        "passthrough",
        "-f",
        "rawvideo",
        "-",
      ])
      assert.equal(pixels.length, 4)
      assert.ok(
        pixels[0] > 200 && pixels[3] > 200,
        "No label outside its interval"
      )
      assert.ok(
        pixels[1] < 150 && pixels[2] < 150,
        "One label on the exact first and last intended frames"
      )
      const bytes = await readFile(video)
      assert.ok(bytes.indexOf("moov") < bytes.indexOf("mdat"))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)
