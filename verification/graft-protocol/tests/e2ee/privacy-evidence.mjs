// Acceptance-only, opt-in full-byte evidence. Never use with real user data.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export class PrivacyEvidence {
  constructor(path, { maxBytes = 16 * 1024 * 1024, maxRecords = 4096 } = {}) {
    assert.ok(Number.isSafeInteger(maxBytes) && maxBytes > 0);
    assert.ok(Number.isSafeInteger(maxRecords) && maxRecords > 0);
    this.path = path;
    this.maxBytes = maxBytes;
    this.maxRecords = maxRecords;
    this.bytes = 0;
    this.sequence = 0;
    this.failed = false;
    this.finished = false;
    this.chain = createHash("sha256");
    writeFileSync(path, "", { flag: "wx", mode: 0o600 });
  }

  fail(reason) {
    if (!this.failed) {
      this.failed = true;
      appendFileSync(this.path, JSON.stringify({ failure: reason }) + "\n");
    }
    throw new Error(`Privacy evidence incomplete: ${reason}`);
  }

  record(surface, repository, operation, metadata = {}, body = new Uint8Array()) {
    if (this.finished) this.fail("record after finalization");
    if (this.failed) this.fail("previous capture failure");
    const bytes = Buffer.from(body);
    const metadataBytes = Buffer.from(JSON.stringify(metadata));
    if (this.sequence >= this.maxRecords || this.bytes + bytes.length + metadataBytes.length > this.maxBytes)
      this.fail("capture budget exceeded");
    this.bytes += bytes.length + metadataBytes.length;
    const line = JSON.stringify({
      sequence: ++this.sequence, surface, repository, operation, metadata,
      byteLength: bytes.length, sha256: digest(bytes), bodyHex: bytes.toString("hex"),
    }) + "\n";
    this.chain.update(line);
    appendFileSync(this.path, line);
  }

  finish() {
    if (this.failed || this.finished) this.fail("invalid finalization");
    this.finished = true;
    appendFileSync(this.path, JSON.stringify({ complete: true, records: this.sequence,
      bytes: this.bytes, sha256: this.chain.digest("hex") }) + "\n");
  }

  async captureHttp(surface, repository, message, requestId) {
    // Reading only a clone preserves the real request/response body.
    const clone = message.clone();
    const chunks = [];
    let size = 0;
    const reader = clone.body?.getReader();
    try {
      if (reader) for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (this.bytes + size > this.maxBytes) this.fail("HTTP body exceeds capture budget");
        chunks.push(value);
      }
    } catch (error) {
      // Do not await cancellation of a tee: the original is still unconsumed.
      void reader?.cancel().catch(() => {});
      this.fail(error instanceof Error && error.message.startsWith("Privacy evidence incomplete")
        ? "HTTP capture budget exceeded" : "HTTP body read failed");
    }
    const metadata = { requestId, headers: [...message.headers],
      ...(surface === "request" ? { url: message.url, method: message.method } : { status: message.status }) };
    this.record(surface, repository, surface, metadata, Buffer.concat(chunks, size));
  }
}

export function readPrivacyEvidence(path, { allowOpen = false } = {}) {
  const text = readFileSync(path, "utf8");
  assert.ok(text.length > 0 && text.endsWith("\n"), "Missing or truncated privacy evidence");
  const lines = text.trimEnd().split("\n");
  const records = lines.map((line) => JSON.parse(line));
  const footer = records.at(-1)?.complete === true ? records.pop() : null;
  assert.ok(allowOpen || footer, "Privacy evidence has no completion footer");
  if (footer) {
    assert.equal(footer.records, records.length, "Privacy evidence tail missing");
    const sequence = lines.slice(0, -1);
    assert.equal(footer.sha256, digest(Buffer.from(sequence.length ? sequence.join("\n") + "\n" : "")), "Privacy evidence sequence digest mismatch");
  }
  let totalBytes = 0;
  for (const [index, record] of records.entries()) {
    assert.equal(record.failure, undefined, "Privacy capture failed; partial evidence cannot pass");
    assert.equal(record.sequence, index + 1, "Privacy sequence missing or reordered");
    assert.match(record.bodyHex, /^(?:[0-9a-f]{2})*$/);
    const bytes = Buffer.from(record.bodyHex, "hex");
    assert.equal(bytes.length, record.byteLength, "Privacy byte count mismatch");
    assert.equal(digest(bytes), record.sha256, "Privacy digest mismatch");
    totalBytes += bytes.length + Buffer.byteLength(JSON.stringify(record.metadata));
  }
  if (footer) assert.equal(footer.bytes, totalBytes, "Privacy evidence total byte count mismatch");
  return records;
}

export function forbiddenPatterns(markers) {
  return markers.map((marker) => {
    const bytes = Buffer.from(marker);
    assert.ok(bytes.length >= 4, "Use distinct synthetic markers, not short common text");
    return [bytes, Buffer.from(bytes.toString("hex")), Buffer.from(bytes.toString("base64"))];
  });
}

export function assertPrivateBytes(bytes, markers, label) {
  const input = Buffer.from(bytes);
  for (const [index, patterns] of forbiddenPatterns(markers).entries())
    assert.ok(patterns.every((pattern) => !input.includes(pattern)), `Private marker ${index} appeared in ${label}`);
}

export function assertPrivacyEvidence(records, markers, diagnosticOnly = []) {
  const streams = new Map();
  for (const record of records) {
    const privateMarkers = record.surface === "diagnostic" ? [...markers, ...diagnosticOnly] : markers;
    assertPrivateBytes(Buffer.from(record.bodyHex, "hex"), privateMarkers, `${record.surface} #${record.sequence} body`);
    assertPrivateBytes(JSON.stringify(record.metadata), privateMarkers, `${record.surface} #${record.sequence} metadata`);
    if (record.surface === "diagnostic" || (record.surface === "multipart" && record.operation === "uploadPart")) {
      const key = JSON.stringify([record.surface, record.repository, record.operation, record.metadata.uploadId]);
      if (!streams.has(key)) streams.set(key, { markers: privateMarkers, chunks: [] });
      streams.get(key).chunks.push(Buffer.from(record.bodyHex, "hex"));
    }
  }
  for (const { markers: values, chunks } of streams.values())
    assertPrivateBytes(Buffer.concat(chunks), values, "reassembled diagnostic/multipart stream");
}

export function assertLegacyRequestPrivacy(captures, markers) {
  for (const [index, capture] of captures.entries()) {
    assertPrivateBytes(JSON.stringify(capture), markers, `legacy request ${index}`);
    // Old binary capture bodies are hex strings; inspect the actual bytes too.
    if (typeof capture.body === "string" && /^(?:[0-9a-f]{2})+$/.test(capture.body))
      assertPrivateBytes(Buffer.from(capture.body, "hex"), markers, `legacy request ${index} decoded body`);
  }
}
