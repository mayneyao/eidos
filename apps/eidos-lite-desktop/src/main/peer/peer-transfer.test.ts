import { PeerTransferTracker } from "./peer-transfer"

it("counts concurrent payloads by device identity and finishes each request once", () => {
  const tracker = new PeerTransferTracker()
  const upload = tracker.begin("a", "Phone", "receiving")
  const download = tracker.begin("a", "Phone", "sending")
  const other = tracker.begin("b", "Phone", "sending")
  upload.received(1024)
  download.sent(2048)
  other.sent(10)
  upload.finish()
  upload.finish("late close")
  expect(tracker.snapshot()[0]).toMatchObject({
    receivedBytes: 1024,
    sentBytes: 2048,
    activeRequests: 1,
    error: undefined,
  })
  download.fail("Read failed")
  download.finish("HTTP 500")
  expect(tracker.snapshot()[0]).toMatchObject({
    activeRequests: 0,
    error: "Read failed",
  })
  expect(tracker.snapshot()[1]).toMatchObject({
    sentBytes: 10,
    activeRequests: 1,
  })
  const retry = tracker.begin("a", "Renamed phone", "merging")
  expect(tracker.snapshot()[0]).toMatchObject({
    name: "Renamed phone",
    error: undefined,
    receivedBytes: 1024,
  })
  retry.finish()
  other.finish()
})
