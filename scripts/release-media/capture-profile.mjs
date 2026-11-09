export const CAPTURE_PROFILE = Object.freeze({
  id: "lite-macos-2528x1768-v1",
  windowWidth: 1200,
  windowHeight: 820,
  desktopPadding: 32,
  scale: 2,
  width: 2528,
  height: 1768,
  fps: 30,
  crf: 18,
  preset: "medium",
  posterQuality: 90,
  minimumTipSeconds: 1.5,
  tipY: 1620,
  tipFontSize: 50,
  tipBoxPadding: 14,
  tipFont: "/System/Library/Fonts/SFNS.ttf",
})

// The native recorder and input helper share this monotonic clock. Its zero is
// the recording-start callback; new takes also retain the first stream frame's
// measured display clock so callback latency does not shift the public labels.
export function parseInputTimeline(jsonl, { requireFirstFrame = false } = {}) {
  const rows = jsonl.trim().split("\n").filter(Boolean).map(JSON.parse)
  const clock = rows.shift()
  if (
    clock?.type !== "recording-start" ||
    clock.clock !== "DispatchTime.uptimeNanoseconds" ||
    !/^\d+$/.test(clock.monotonicNs)
  )
    throw new Error("Missing native recording clock")
  const origin = BigInt(clock.monotonicNs)
  const frame = clock.firstFrame
  if (
    (requireFirstFrame && !frame) ||
    (frame &&
      (frame.clock !== "mach_absolute_time" ||
        !/^\d+$/.test(frame.monotonicNs) ||
        !/^\d+$/.test(frame.displayTimeTicks) ||
        !Number.isInteger(frame.timebaseNumer) ||
        frame.timebaseNumer <= 0 ||
        !Number.isInteger(frame.timebaseDenom) ||
        frame.timebaseDenom <= 0 ||
        !/^-?\d+$/.test(frame.presentationTimeValue) ||
        !Number.isInteger(frame.presentationTimeScale) ||
        frame.presentationTimeScale <= 0 ||
        ![0, 4].includes(frame.status) ||
        frame.recordingOutputAddedBeforeCapture !== true))
  )
    throw new Error("Missing or invalid measured first-frame clock")
  const mediaOrigin = frame ? BigInt(frame.monotonicNs) : origin
  if (frame) {
    const ticks = BigInt(frame.displayTimeTicks)
    if (
      (ticks * BigInt(frame.timebaseNumer)) / BigInt(frame.timebaseDenom) !==
      mediaOrigin
    )
      throw new Error("First-frame clock does not match its native timebase")
  }
  let previous = origin
  const held = new Set()
  const events = rows.map((event) => {
    if (
      event.type !== "keyboard" ||
      !["key", "modifier", "text"].includes(event.kind) ||
      !["down", "up"].includes(event.phase) ||
      !Number.isInteger(event.keyCode) ||
      !Array.isArray(event.modifiers) ||
      !/^\d+$/.test(event.postStartedNs) ||
      !/^\d+$/.test(event.postCompletedNs)
    )
      throw new Error("Invalid native key event")
    const start = BigInt(event.postStartedNs)
    const end = BigInt(event.postCompletedNs)
    if (start < previous || start < mediaOrigin || end < start)
      throw new Error("Non-monotonic native input timeline")
    previous = end
    const identity = `${event.kind}:${event.keyCode}`
    if (event.phase === "down") {
      if (held.has(identity))
        throw new Error("Key pressed twice without release")
      held.add(identity)
    } else if (!held.delete(identity)) {
      throw new Error("Key released without a matching press")
    }
    if (event.relevant && (event.kind !== "key" || !event.label?.trim()))
      throw new Error("Relevant shortcut is missing its scene label")
    return {
      ...event,
      relativeSeconds: Number(start - mediaOrigin) / 1e9,
      postDurationSeconds: Number(end - start) / 1e9,
    }
  })
  if (held.size)
    throw new Error("Native input timeline contains unreleased keys")
  return {
    schemaVersion: 1,
    clock,
    events,
    directNativeEvents: true,
    mediaAlignment: frame
      ? {
          reference: "first SCStream video sample displayTime",
          firstFrameMonotonicNs: frame.monotonicNs,
          recordingCallbackMonotonicNs: clock.monotonicNs,
          callbackToMediaOffsetSeconds: Number(origin - mediaOrigin) / 1e9,
          nativeMeasurement: true,
          playbackReview: "pending",
        }
      : null,
  }
}

export function buildShortcutIntervals(timeline, frameCount) {
  if (!Number.isInteger(frameCount) || frameCount < 1)
    throw new Error("A real positive output frame count is required")
  const profile = CAPTURE_PROFILE
  const relevant = timeline.events.filter(
    (e) => e.kind === "key" && e.phase === "down" && e.relevant
  )
  const minimumFrames = Math.ceil(profile.minimumTipSeconds * profile.fps)
  return relevant
    .map((event, index) => {
      const startFrame = Math.ceil(event.relativeSeconds * profile.fps)
      const next = relevant[index + 1]
      const nextFrame = next
        ? Math.ceil(next.relativeSeconds * profile.fps)
        : Infinity
      const endFrameExclusive = Math.min(startFrame + minimumFrames, nextFrame)
      if (startFrame < 0 || endFrameExclusive > frameCount)
        throw new Error(
          "Recording needs a longer real tail for its shortcut tip"
        )
      return {
        label: event.label,
        keyCode: event.keyCode,
        modifiers: event.modifiers,
        startFrame,
        endFrameExclusive,
        preempted: nextFrame < startFrame + minimumFrames,
      }
    })
    .filter((event) => event.endFrameExclusive > event.startFrame)
}

const filterValue = (value) =>
  "'" + value.replaceAll("\\", "\\\\").replaceAll("'", "'\\''") + "'"

export function shortcutVideoFilter(intervals, textFiles) {
  if (intervals.length !== textFiles.length)
    throw new Error("Each shortcut interval needs one literal text file")
  const p = CAPTURE_PROFILE
  return intervals
    .map((interval, index) =>
      [
        `drawtext=fontfile=${filterValue(p.tipFont)}`,
        `textfile=${filterValue(textFiles[index])}`,
        "expansion=none",
        `fontsize=${p.tipFontSize}`,
        "fontcolor=white",
        "box=1",
        "boxcolor=0x202327@0.94",
        `boxborderw=${p.tipBoxPadding}`,
        "x=(w-text_w)/2",
        `y=${p.tipY}`,
        `enable='gte(n,${interval.startFrame})*lt(n,${interval.endFrameExclusive})'`,
      ].join(":")
    )
    .join(",")
}

export function captureVideoFilter(intervals, textFiles) {
  return [
    "setpts=PTS-STARTPTS",
    `fps=${CAPTURE_PROFILE.fps}`,
    shortcutVideoFilter(intervals, textFiles),
  ]
    .filter(Boolean)
    .join(",")
}

export function validateVideoProfile(probe) {
  const p = CAPTURE_PROFILE
  const video = probe.streams?.[0]
  if (
    probe.streams?.length !== 1 ||
    video.codec_type !== "video" ||
    video.codec_name !== "h264" ||
    video.pix_fmt !== "yuv420p" ||
    video.r_frame_rate !== `${p.fps}/1` ||
    video.width !== p.width ||
    video.height !== p.height ||
    !Number.isFinite(Number(probe.format?.duration)) ||
    Number(probe.format.duration) <= 0
  )
    throw new Error("Video does not match the standard release-media profile")
}
