// Loopback-only interoperability harness. Fixtures contain synthetic encrypted
// bytes, never production credentials, root keys or sync passwords.
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createHash, createHmac, hkdfSync, randomUUID } from "node:crypto";
import { PrivacyEvidence } from "./privacy-evidence.mjs";
import {
  createGraftRemoteHandler,
  GraftProtocolError,
} from "../../packages/graft-remote/dist/index.js";

const [fixturePath, capturePath] = process.argv.slice(2);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
// Only the small privacy acceptance fixture opts in. Default/performance runs
// retain their original capture format and perform no additional body reads.
const privacy = fixture.privacyEvidence === true
  ? new PrivacyEvidence(`${capturePath}.privacy.jsonl`) : null;
const objects = new Map(fixture.objects.map(([key, bytes]) => [key, Uint8Array.from(bytes)]));
const captures = [];
const equal = (left, right) =>
  left === undefined
    ? right === undefined
    : right !== undefined && Buffer.from(left).equals(Buffer.from(right));
const syntheticFields = (bytes) => {
  const fields = [];
  let offset = 2;
  for (let index = 0; index < bytes.readUInt16BE(0); index += 1) {
    const length = bytes.readUInt32BE(offset);
    fields.push(bytes.subarray(offset + 4, offset + 4 + length));
    offset += 4 + length;
  }
  return fields;
};
const syntheticEncode = (fields) => {
  const count = Buffer.alloc(2);
  count.writeUInt16BE(fields.length);
  return Buffer.concat([count, ...fields.flatMap((field) => {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(field.length);
    return [size, field];
  })]);
};
function createBackend(objects, faults = {}, encryption = fixture.encryption, repository = "repo") {
  if (privacy) for (const [key, bytes] of objects)
    if (bytes !== undefined) privacy.record("storage", repository, "initial", { key }, bytes);
  const uploads = new Map();
  const multipart = fixture.enableMultipart === true ? {
    supportsEncryption: true,
    start(path, totalBytes, partBytes, identity) {
      if (objects.has(path)) return null;
      if (identity?.uuid !== encryption.uuid) throw new GraftProtocolError(400, "invalid_identity", "Synthetic upload identity mismatch");
      let upload = uploads.get(path);
      if (upload && (upload.totalBytes !== totalBytes || upload.partBytes !== partBytes ||
          upload.encryption.uuid !== identity.uuid || upload.encryption.uploadId !== identity.uploadId ||
          upload.encryption.ciphertextSha256 !== identity.ciphertextSha256)) {
        throw new GraftProtocolError(409, "upload_conflict", "Synthetic upload identity conflict");
      }
      if (!upload) {
        upload = { uploadId: randomUUID(), totalBytes, partBytes, encryption: { ...identity }, parts: new Map() };
        uploads.set(path, upload);
      }
      privacy?.record("multipart", repository, "start", { path, uploadId: upload.uploadId, totalBytes, partBytes, identity });
      return { ...upload, uploadedParts: [...upload.parts].sort(([a], [b]) => a - b)
        .map(([partNumber, body]) => ({ partNumber, bytes: body.length })) };
    },
    async uploadPart(path, uploadId, partNumber, value, contentLength) {
      const upload = uploads.get(path);
      if (!upload || upload.uploadId !== uploadId) throw new GraftProtocolError(409, "upload_conflict", "Synthetic upload session mismatch");
      const body = new Uint8Array(await new Response(value).arrayBuffer());
      const expected = Math.min(upload.partBytes, upload.totalBytes - (partNumber - 1) * upload.partBytes);
      if (partNumber < 1 || partNumber > Math.ceil(upload.totalBytes / upload.partBytes) || body.length !== expected || contentLength !== expected)
        throw new GraftProtocolError(400, "invalid_part", "Synthetic upload part mismatch");
      const previous = upload.parts.get(partNumber);
      privacy?.record("multipart", repository, "uploadPart", { path, uploadId, partNumber }, body);
      if (previous && !equal(previous, body)) throw new GraftProtocolError(409, "part_conflict", "Synthetic upload part conflict");
      upload.parts.set(partNumber, body);
    },
    complete(path, uploadId) {
      const upload = uploads.get(path);
      if (!upload || upload.uploadId !== uploadId) throw new GraftProtocolError(409, "upload_conflict", "Synthetic upload session mismatch");
      if (upload.parts.size !== Math.ceil(upload.totalBytes / upload.partBytes)) throw new GraftProtocolError(409, "incomplete_upload", "Synthetic upload incomplete");
      const body = Buffer.concat([...upload.parts].sort(([a], [b]) => a - b).map(([, bytes]) => bytes));
      privacy?.record("multipart", repository, "complete", { path, uploadId }, body);
      if (body.length !== upload.totalBytes || createHash("sha256").update(body).digest("hex") !== upload.encryption.ciphertextSha256)
        throw new GraftProtocolError(409, "upload_integrity", "Synthetic upload digest mismatch");
      if (objects.has(path)) return false;
      privacy?.record("storage", repository, "multipart-complete", { key: path }, body);
      objects.set(path, Uint8Array.from(body));
      uploads.delete(path);
      return true;
    },
    abort(path, uploadId) {
      if (privacy && uploads.get(path)?.uploadId === uploadId)
        for (const [partNumber, body] of uploads.get(path).parts)
          privacy.record("multipart", repository, "abort", { path, uploadId, partNumber }, body);
      if (uploads.get(path)?.uploadId === uploadId) uploads.delete(path);
    },
  } : undefined;
  return {
    encryption: Object.freeze(encryption),
    ...(multipart === undefined ? {} : { multipart }),
    head(key) {
      const body = objects.get(key);
      privacy?.record("storage", repository, "head", { key }, body);
      return body === undefined ? null : { size: body.length };
    },
    get(key, range) {
      const bytes = objects.get(key);
      if (bytes === undefined) return null;
      const body = range === undefined ? bytes : bytes.slice(range.start, range.end + 1);
      privacy?.record("storage", repository, "get", { key, range }, body);
      return { body, size: body.length };
    },
    put(key, value) {
      privacy?.record("storage", repository, "put", { key }, value);
      objects.set(key, value.slice());
    },
    delete(key) {
      privacy?.record("storage", repository, "delete", { key }, objects.get(key));
      objects.delete(key);
    },
    async putIfAbsent(key, value) {
      const bytes =
        value instanceof ReadableStream
          ? new Uint8Array(await new Response(value).arrayBuffer())
          : value;
      privacy?.record("storage", repository, "putIfAbsent", { key }, bytes);
      if (objects.has(key)) return false;
      objects.set(key, bytes.slice());
      return true;
    },
    compareAndSwap(key, expected, replacement) {
      if (privacy) {
        privacy.record("storage", repository, "compareAndSwap-before", { key }, objects.get(key));
        privacy.record("storage", repository, "compareAndSwap-candidate", { key }, replacement);
      }
      if (faults.rejectHeadCreates > 0 && key.startsWith("e2ee/head/")) {
        faults.rejectHeadCreates -= 1;
        captures[captures.length - 1].rejectedInitialHeadCreate = true;
        writeFileSync(capturePath, JSON.stringify(captures));
        throw new GraftProtocolError(503, "synthetic_head_failure", "Synthetic initial HEAD failure");
      }
      if (!equal(expected, objects.get(key))) return false;
      objects.set(key, replacement.slice());
      return true;
    },
    compareAndDelete(key, expected) {
      privacy?.record("storage", repository, "compareAndDelete", { key }, objects.get(key));
      if (!equal(expected, objects.get(key))) return false;
      objects.delete(key);
      return true;
    },
    list(query) {
      if (fixture.omitPackListings === true && ["e2ee/packs/", "e2ee/indexes/"].includes(query.prefix))
        return { paths: [], hasMore: false };
      const keys = [...objects.keys()]
        .filter(
          (key) => key.startsWith(query.prefix) && (query.after === undefined || key > query.after),
        )
        .sort();
      return { paths: keys.slice(0, query.limit), hasMore: keys.length > query.limit };
    },
  };
}
const backend = createBackend(objects);
const integrationBackend = createBackend(new Map([["e2ee/config", objects.get("e2ee/config")]]), {
  rejectHeadCreates: fixture.failIntegrationHeadCreates === true ? 3 : 0,
}, fixture.encryption, "integration");
const enrollmentBackend = createBackend(new Map(), {
  rejectHeadCreates: fixture.failInitialHeadCreates === true ? 3 : 0,
}, fixture.encryption, "enrollment");
const terminalBackend = fixture.terminalEncryption
  ? createBackend(new Map(), {}, fixture.terminalEncryption, "terminal") : null;
const migrationBackend = fixture.migrationEncryption
  ? createBackend(new Map(), {}, fixture.migrationEncryption, "migration") : null;
let droppedMigrationConfigResponse = false;
let dropMigrationConfigRead = false;
let droppedInitialConfigResponse = false;
let dropInitialConfigRead = false;
let droppedConfigMutationResponse = false;
let dropConfigMutationRead = false;
const refAcknowledgementKeys = new Set(fixture.dropRefMutationAcknowledgements ?? []);
const droppedRefAcknowledgements = new Set();
const pendingRefReadLosses = new Set();
let gatedInitialCreates = 0;
const initialCreateWaiters = [];
let heldInitialization = false;
let droppedReceiveAcknowledgement = false;
let droppedMultipartPartAcknowledgement = false;
let droppedMultipartCompleteAcknowledgement = false;
let droppedMultipartAbortAcknowledgement = false;
const heldMigrationBoundaries = new Set();
const configMutationBase = fixture.dropEnrollmentConfigMutationAcknowledgements === true
  ? "/acme/enrollment"
  : fixture.dropIntegrationConfigMutationAcknowledgements === true
    ? "/acme/integration" : "/acme/repo";
const handler = createGraftRemoteHandler({
  authenticate({ request }) {
    if (
      !["Bearer account-token", "Bearer renewed-account-token"].includes(
        request.headers.get("authorization"),
      )
    ) {
      throw new GraftProtocolError(401, "unauthorized", "Synthetic test bearer token required");
    }
    return "test-account";
  },
  authorize({ principal }) {
    if (principal !== "test-account") throw new Error("missing test principal");
  },
  backend: ({ repository }) =>
    repository.namespace !== "acme"
      ? null
      : repository.name === "repo"
        ? backend
        : repository.name === "integration"
          ? integrationBackend
          : repository.name === "enrollment"
            ? enrollmentBackend
          : repository.name === "terminal"
            ? terminalBackend
          : repository.name === "migration"
            ? migrationBackend
          : null,
  limits: {
    maxRequestBytes: fixture.maxRequestBytes ?? 64 * 1024 * 1024,
    ...(fixture.multipartPartBytes === undefined ? {} : { multipartPartBytes: fixture.multipartPartBytes }),
  },
});
let smallPayloadMissingOnce = false;
let privacyRequestSequence = 0;
const server = createServer(async (incoming, outgoing) => {
  const privacyRequestId = privacy ? ++privacyRequestSequence : 0;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const url = new URL(incoming.url, origin);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const headers = new Headers();
    for (let i = 0; i < incoming.rawHeaders.length; i += 2)
      headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
    const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD";
    const request = new Request(url, {
      method: incoming.method,
      headers,
      ...(hasBody ? { body: Readable.toWeb(incoming), duplex: "half" } : {}),
    });
    if (privacy) await privacy.captureHttp("request", parts[1] ?? "unknown", request, privacyRequestId);
    const body = hasBody
      ? ["application/octet-stream", "application/vnd.graft.e2ee-bundle"].includes(headers.get("content-type"))
        ? Buffer.from(await request.clone().arrayBuffer()).toString("hex")
        : await request.clone().text()
      : "";
    const capture = {
      method: incoming.method,
      path: url.pathname,
      query: url.search,
      body,
      expectedPresent: headers.get("x-graft-expected-present"),
      expectedHex: headers.get("x-graft-expected-hex"),
      ...(parts[2]?.startsWith("multipart-") ? {
        encryptionUuid: headers.get("x-graft-e2ee-uuid"),
        encryptionUploadId: headers.get("x-graft-e2ee-upload-id"),
        ciphertextSha256: headers.get("x-graft-e2ee-ciphertext-sha256"),
        serverUploadId: headers.get("x-graft-upload-id"),
        partNumber: headers.get("x-graft-part-number"),
      } : {}),
      authenticated: ["Bearer account-token", "Bearer renewed-account-token"].includes(
        headers.get("authorization"),
      ),
      ...(fixture.gateInitialConfigCreates === true ? {
        syntheticCredential: headers.get("authorization") === "Bearer renewed-account-token" ? "second" : "first",
      } : {}),
    };
    captures.push(capture);
    writeFileSync(capturePath, JSON.stringify(captures));
    const migrationBoundary = fixture.migrationHoldControl
      ? readFileSync(fixture.migrationHoldControl, "utf8") : "";
    const migrationConfigCreate = incoming.method === "PUT" &&
      url.pathname === "/acme/migration/raw-if-not-exists/e2ee/config";
    const holdMigration = () => {
      heldMigrationBoundaries.add(migrationBoundary);
      capture.heldMigration = migrationBoundary;
      writeFileSync(capturePath, JSON.stringify(captures));
      console.log(JSON.stringify({ migration_held: migrationBoundary }));
    };
    if (!heldMigrationBoundaries.has(migrationBoundary) && (
      (migrationBoundary === "config-before" && migrationConfigCreate) ||
      (migrationBoundary === "verification-read" && incoming.method === "GET" &&
        url.pathname.startsWith("/acme/migration/raw/e2ee/") && parts[4] !== "config")
    )) {
      holdMigration();
      return;
    }
    const initialConfigCreate = incoming.method === "PUT" && url.pathname === "/acme/enrollment/raw-if-not-exists/e2ee/config";
    if (fixture.holdInitialization === "config-before" && !heldInitialization && initialConfigCreate) {
      heldInitialization = true;
      capture.heldInitialization = "config-before";
      writeFileSync(capturePath, JSON.stringify(captures));
      console.log(JSON.stringify({ initialization_held: "config-before" }));
      return;
    }
    if (fixture.gateInitialConfigCreates === true && incoming.method === "PUT" &&
        url.pathname === "/acme/enrollment/raw-if-not-exists/e2ee/config" &&
        ++gatedInitialCreates <= 2) {
      capture.gatedInitialConfigCreate = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("synthetic initialization barrier timed out")), 30000);
        initialCreateWaiters.push(() => { clearTimeout(timeout); resolve(); });
        if (initialCreateWaiters.length === 2) {
          for (const release of initialCreateWaiters.splice(0)) release();
        }
      });
    }
    let response = await handler({
      request,
      route: {
        namespace: parts[0],
        repository: parts[1],
        operation: parts[2],
        objectPath: parts.slice(3).join("/") || undefined,
      },
      adapterContext: undefined,
    });
    // Synthetic adversarial fetch responses for native fail-closed tests.
    if (fixture.fetchFault && response.status === 200 && url.pathname.includes("/e2ee/fetch-bundle/")) {
      if (fixture.fetchFault === "unavailable") {
        await response.body?.cancel();
        response = new Response(null, { status: 422, headers: { "Graft-Protocol": "1" } });
      } else {
        const bytes = Buffer.from(await response.arrayBuffer());
        const fields = [];
        let offset = 14;
        for (let field = 0; field < 4; field += 1) {
          const length = bytes.readUInt32BE(offset);
          fields.push([offset + 4, length]);
          offset += 4 + length;
        }
        if (fixture.fetchFault === "ref-key") bytes[fields[1][0] + fields[1][1] - 1] ^= 1;
        else if (fixture.fetchFault === "ref-ciphertext") bytes[fields[2][0] + fields[2][1] - 1] ^= 1;
        else if (fixture.fetchFault === "framing") bytes[0] ^= 1;
        else if (["hint-mac", "hint-topology"].includes(fixture.fetchFault)) {
          offset = 12 + bytes.readUInt32BE(8);
          while (offset < bytes.length) {
            const keyLength = bytes.readUInt32BE(offset);
            const length = Number(bytes.readBigUInt64BE(offset + 4));
            const key = bytes.subarray(offset + 12, offset + 12 + keyLength).toString();
            offset += 12 + keyLength;
            if (key.startsWith("e2ee/hints/")) {
              if (fixture.fetchFault === "hint-mac") bytes[offset + length - 1] ^= 1;
              else {
                // This fixture uses a public synthetic root, never an account key.
                const hint = bytes.subarray(offset, offset + length);
                const body = hint.subarray(28, -32);
                syntheticFields(syntheticFields(syntheticFields(body)[2])[0])[0][0] ^= 1;
                const profile = Buffer.from("encrypted-remote-v1");
                const uuid = Buffer.from(fixture.encryption.uuid.replaceAll("-", ""), "hex");
                const info = syntheticEncode([Buffer.from("graft/e2ee/v1"), profile, Buffer.from([0, 1]), Buffer.from("hint")]);
                const hintKey = Buffer.from(hkdfSync("sha256", Buffer.alloc(32, 42), uuid, info, 32));
                const macInput = syntheticEncode([Buffer.from("graft/routing-hint/v1"), profile, uuid, Buffer.from(key), hint.subarray(0, 28), body]);
                createHmac("sha256", hintKey).update(macInput).digest().copy(hint, hint.length - 32);
              }
              break;
            }
            offset += length;
          }
        }
        response = new Response(bytes, { status: response.status, headers: response.headers });
      }
    }
    if (fixture.fetchFault === "small-payload-missing" && !smallPayloadMissingOnce &&
        incoming.method === "GET" && url.pathname.includes("/raw/e2ee/files/") &&
        response.status === 206 && (objects.get(parts.slice(3).join("/"))?.length ?? Infinity) < 256 * 1024) {
      smallPayloadMissingOnce = true;
      await response.body?.cancel();
      response = new Response(null, { status: 404, headers: { "Graft-Protocol": "1" } });
      capture.droppedSmallPayload = true;
    }
    capture.responseStatus = response.status;
    if (privacy) await privacy.captureHttp("response", parts[1] ?? "unknown", response, privacyRequestId);
    writeFileSync(capturePath, JSON.stringify(captures));
    if (!heldMigrationBoundaries.has(migrationBoundary) && response.status === 204 && (
      (migrationBoundary === "config-after" && migrationConfigCreate) ||
      (migrationBoundary === "dependency-after" && incoming.method === "PUT" &&
        url.pathname.startsWith("/acme/migration/raw-if-not-exists/e2ee/") &&
        ["commits", "segments", "files", "objects"].includes(parts[4])) ||
      (migrationBoundary === "ref-after" && incoming.method === "POST" &&
        (url.pathname.startsWith("/acme/migration/cas/e2ee/refs/") ||
         url.pathname.startsWith("/acme/migration/e2ee/receive-bundle/e2ee/refs/"))) ||
      (migrationBoundary === "head-after" && incoming.method === "POST" &&
        url.pathname.startsWith("/acme/migration/cas/e2ee/head/"))
    )) {
      holdMigration();
      return;
    }
    if (fixture.dropMultipartAbortAcknowledgement === true &&
        parts[2] === "multipart-abort" && response.status === 204 &&
        !droppedMultipartAbortAcknowledgement) {
      droppedMultipartAbortAcknowledgement = true;
      capture.droppedMultipartAbortResponse = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      outgoing.destroy();
      return;
    }
    if (fixture.multipartFault === "part-and-complete-loss" && response.status === 204 && (
      (parts[2] === "multipart-part" && !droppedMultipartPartAcknowledgement) ||
      (parts[2] === "multipart-complete" && !droppedMultipartCompleteAcknowledgement)
    )) {
      if (parts[2] === "multipart-part") droppedMultipartPartAcknowledgement = true;
      else droppedMultipartCompleteAcknowledgement = true;
      capture.droppedMultipartResponse = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      outgoing.destroy();
      return;
    }
    // Synthetic tag recovery fault: the real CAS commits, but neither its
    // acknowledgement nor the first confirming read reaches the client.
    const isReceive = parts[2] === "e2ee" && parts[3] === "receive-bundle";
    const refKey = parts.slice(isReceive ? 4 : 3).join("/");
    if (fixture.receiveFault === "receive-loss" && !droppedReceiveAcknowledgement && isReceive && response.status === 204) {
      droppedReceiveAcknowledgement = true;
      pendingRefReadLosses.add(refKey);
      capture.droppedReceiveResponse = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      outgoing.destroy();
      return;
    }
    if (parts[0] === "acme" && parts[1] === "repo" &&
        incoming.method === "POST" && (parts[2] === "cas" || isReceive) && response.status === 204 &&
        refAcknowledgementKeys.has(refKey) && !droppedRefAcknowledgements.has(refKey)) {
      droppedRefAcknowledgements.add(refKey);
      pendingRefReadLosses.add(refKey);
      capture.droppedRefMutationResponse = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      outgoing.destroy();
      return;
    }
    if (parts[0] === "acme" && parts[1] === "repo" &&
        incoming.method === "GET" && parts[2] === "raw" && pendingRefReadLosses.delete(refKey)) {
      capture.droppedRefMutationRead = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      outgoing.destroy();
      return;
    }
    if (!heldInitialization && response.status === 204 && (
      (fixture.holdInitialization === "config-after" && initialConfigCreate) ||
      (fixture.holdInitialization === "head-after" && incoming.method === "POST" && url.pathname.startsWith("/acme/enrollment/cas/e2ee/head/"))
    )) {
      heldInitialization = true;
      capture.heldInitialization = fixture.holdInitialization;
      writeFileSync(capturePath, JSON.stringify(captures));
      console.log(JSON.stringify({ initialization_held: fixture.holdInitialization }));
      return;
    }
    // Explicit synthetic fault: commit through the actual handler, then lose
    // its first initialization acknowledgement. No fault route exists in production.
    if (fixture.dropMigrationConfigAcknowledgements === true && !droppedMigrationConfigResponse &&
        incoming.method === "PUT" && url.pathname === "/acme/migration/raw-if-not-exists/e2ee/config" && response.status === 204) {
      droppedMigrationConfigResponse = true;
      dropMigrationConfigRead = true;
      capture.droppedMigrationConfigResponse = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      outgoing.destroy();
      return;
    }
    if (dropMigrationConfigRead && incoming.method === "GET" && url.pathname === "/acme/migration/raw/e2ee/config") {
      dropMigrationConfigRead = false;
      capture.droppedMigrationConfigRead = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      outgoing.destroy();
      return;
    }
    if ((fixture.dropInitialConfigResponse === true || fixture.dropInitialConfigAcknowledgements === true) && !droppedInitialConfigResponse &&
        incoming.method === "PUT" && url.pathname === "/acme/enrollment/raw-if-not-exists/e2ee/config" &&
        response.status === 204) {
      droppedInitialConfigResponse = true;
      dropInitialConfigRead = fixture.dropInitialConfigAcknowledgements === true;
      capture.droppedInitialConfigResponse = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      outgoing.destroy();
      return;
    }
    if (dropInitialConfigRead && incoming.method === "GET" && url.pathname === "/acme/enrollment/raw/e2ee/config") {
      dropInitialConfigRead = false;
      capture.droppedInitialConfigRead = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      outgoing.destroy();
      return;
    }
    if ((fixture.dropConfigMutationAcknowledgements === true || fixture.dropIntegrationConfigMutationAcknowledgements === true || fixture.dropEnrollmentConfigMutationAcknowledgements === true) && !droppedConfigMutationResponse &&
        incoming.method === "POST" && url.pathname === `${configMutationBase}/cas/e2ee/config` && response.status === 204) {
      droppedConfigMutationResponse = true;
      dropConfigMutationRead = true;
      capture.droppedConfigMutationResponse = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      outgoing.destroy();
      return;
    }
    if (dropConfigMutationRead && incoming.method === "GET" && url.pathname === `${configMutationBase}/raw/e2ee/config`) {
      dropConfigMutationRead = false;
      capture.droppedConfigMutationRead = true;
      writeFileSync(capturePath, JSON.stringify(captures));
      outgoing.destroy();
      return;
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body === null) outgoing.end();
    else
      Readable.fromWeb(response.body)
        .on("error", () => outgoing.destroy())
        .pipe(outgoing);
  } catch {
    if (privacy && !privacy.failed)
      await privacy.captureHttp("response", "error", new Response(null, { status: 500 }), privacyRequestId);
    outgoing.writeHead(500);
    outgoing.end();
  }
});
function shutdown() {
  privacy?.finish();
  server.closeAllConnections();
  server.close(() => process.exit(0));
}
if (privacy) process.once("SIGTERM", shutdown);
// Windows terminates a child on kill() without delivering its SIGTERM handler.
// Finalize the evidence through the parent's private IPC channel on every OS.
process.on("message", (message) => {
  if (message === "graft-e2ee-shutdown") shutdown();
});
server.listen(0, "127.0.0.1", () =>
  console.log(
    JSON.stringify({
      url: `http://127.0.0.1:${server.address().port}/acme/repo`,
      integrationUrl: `http://127.0.0.1:${server.address().port}/acme/integration`,
      enrollmentUrl: `http://127.0.0.1:${server.address().port}/acme/enrollment`,
      ...(terminalBackend ? { terminalUrl: `http://127.0.0.1:${server.address().port}/acme/terminal` } : {}),
      ...(migrationBackend ? { migrationUrl: `http://127.0.0.1:${server.address().port}/acme/migration` } : {}),
    }),
  ),
);
// Prevent a failed parent test from leaving an orphaned loopback listener.
setTimeout(shutdown, fixture.serviceLifetimeMs ?? 120000).unref();
