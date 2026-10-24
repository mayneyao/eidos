// Run unchanged in the browser facade and in the real QuickJS executable.
await(async () => {
  const form = new FormData()
  form.append("title", "你好")
  form.append(
    "file",
    new Blob([new Uint8Array([0, 255, 42])], {
      type: "application/octet-stream",
    }),
    "sample.bin"
  )
  const request = new Request(FETCH_URL + "/echo", {
    method: "POST",
    body: form,
  })
  const response = await fetch(request)
  const copy = response.clone()
  const parsed = await response.formData()
  const file = parsed.get("file")
  postMessage([
    parsed.get("title"),
    file.name,
    Array.from(new Uint8Array(await file.arrayBuffer())),
    response.bodyUsed,
    request.bodyUsed,
    (await copy.text()).includes("sample.bin"),
  ])
  const encoded = await fetch(FETCH_URL + "/echo", {
    method: "POST",
    body: new URLSearchParams([
      ["x", "a b"],
      ["x", "你好"],
    ]),
  })
  postMessage((await encoded.formData()).getAll("x"))
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]))
      controller.enqueue(new Uint8Array([3]))
      controller.close()
    },
  })
  const streamed = await fetch(FETCH_URL + "/echo", {
    method: "POST",
    body: stream,
    duplex: "half",
  })
  const reader = streamed.body.getReader(),
    chunks = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(...value)
  }
  postMessage([chunks, streamed.bodyUsed])
  const checked = await fetch(FETCH_URL + "/echo", {
    method: "POST",
    body: "abc",
    integrity: "sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=",
  })
  postMessage(await checked.text())
  try {
    await fetch(FETCH_URL + "/echo", {
      method: "POST",
      body: "different",
      integrity: "sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=",
    })
  } catch (error) {
    postMessage(error.name)
  }
  const byteResponse = await fetch(FETCH_URL + "/echo", {
    method: "POST",
    body: new Uint8Array([9, 8]),
  })
  const byob = byteResponse.body.getReader({ mode: "byob" })
  const first = await byob.read(new Uint8Array(8))
  const last = await byob.read(new Uint8Array(8))
  postMessage([Array.from(first.value), last.done])
  const aborter = new AbortController()
  let cancelled = false
  const waiting = new ReadableStream({
    pull() {
      return new Promise(() => {})
    },
    cancel() {
      cancelled = true
    },
  })
  const pending = fetch(FETCH_URL + "/echo", {
    method: "POST",
    body: waiting,
    duplex: "half",
    signal: aborter.signal,
  })
  setTimeout(() => aborter.abort("stop"), 5)
  try {
    await pending
  } catch (error) {
    postMessage([error, cancelled])
  }
})()
