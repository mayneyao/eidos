import { GraftProtocolError, bytewiseCompare, bytesEqual, emptyResponse, parseExpectedHeaders, protocolHeaders, readLimitedBody, rejectUnexpectedQuery, validateListQuery, jsonResponse, encodeListCursor, } from "./protocol.js";
import { hintUnavailable, } from "./encrypted-routing.js";
export const ENCRYPTED_CAPABILITIES = [
    "range",
    "list",
    "list-cursor",
    "put-if-absent",
    "cas",
    "cad",
    "e2ee-read-bundle",
    "e2ee-fetch-bundle",
    "e2ee-receive-bundle",
];
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const classes = "objects|packs|indexes|files|commits|segments|hints|refs|head";
const opaqueKey = new RegExp(`^e2ee/(${classes})/[0-9a-f]{64}$`);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
export function validateEncryptionDescriptor(value) {
    if (value.profile !== "encrypted-remote-v1" ||
        value.version !== 1 ||
        value.suite !== 1 ||
        typeof value.uuid !== "string" ||
        !uuidPattern.test(value.uuid)) {
        throw new GraftProtocolError(500, "invalid_encryption_identity", "Backend returned an invalid encrypted identity");
    }
}
function validateKey(key, immutable = false) {
    if (key !== "e2ee/config" && !opaqueKey.test(key)) {
        throw new GraftProtocolError(400, "invalid_encrypted_key", "Encrypted remote requires opaque keys");
    }
    if (immutable && transactional(key)) {
        throw new GraftProtocolError(400, "invalid_encrypted_key", "Aggregate requires immutable keys");
    }
}
function transactional(key) {
    return key === "e2ee/config" || key.startsWith("e2ee/refs/") || key.startsWith("e2ee/head/");
}
export async function encryptedOperation(request, backend, operation, path, url, requestLimit, routing) {
    validateEncryptionTransport(url);
    if (operation === "list") {
        return listEncryptedObjects(backend, url);
    }
    return encryptedObjectOperation(request, backend, operation, path, url, requestLimit, routing);
}
export function validateEncryptionTransport(url) {
    if (url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
        throw new GraftProtocolError(400, "encrypted_transport_requires_tls", "Encrypted remote requires HTTPS");
    }
}
async function listEncryptedObjects(backend, url) {
    const query = validateListQuery(url);
    const allowed = query.prefix === "" ||
        query.prefix === "e2ee/" ||
        (query.prefix.startsWith("e2ee/") && "e2ee/config".startsWith(query.prefix)) ||
        new RegExp(`^e2ee/(${classes})/([0-9a-f]{0,64})$`).test(query.prefix);
    if (!allowed)
        throw new GraftProtocolError(400, "invalid_encrypted_prefix", "Invalid encrypted list prefix");
    if (query.after !== undefined) {
        validateKey(query.after);
        if (!query.after.startsWith(query.prefix))
            throw invalidBundle();
    }
    const result = await backend.list(query);
    if (result.paths.length > query.limit)
        throw invalidBackend();
    let previous = query.after;
    for (const key of result.paths) {
        try {
            validateKey(key);
        }
        catch {
            throw invalidBackend();
        }
        if (!key.startsWith(query.prefix) ||
            (previous !== undefined && bytewiseCompare(key, previous) <= 0))
            throw invalidBackend();
        previous = key;
    }
    if (result.hasMore && previous === query.after)
        throw invalidBackend();
    return jsonResponse({
        paths: result.paths,
        ...(result.hasMore ? { next_cursor: encodeListCursor(query.prefix, previous) } : {}),
    });
}
async function encryptedObjectOperation(request, backend, operation, path, url, requestLimit, routing) {
    rejectUnexpectedQuery(url);
    if (operation === "e2ee-read-bundle")
        return readBundle(request, backend, requestLimit);
    if (operation === "e2ee-fetch-bundle")
        return fetchBundle(request, backend, path, routing, requestLimit);
    if (operation === "e2ee-receive-bundle")
        return receiveBundle(request, backend, path, routing, requestLimit);
    if (operation.startsWith("multipart-")) {
        if (path === undefined)
            throw invalidFrame();
        validateKey(path, true);
        if (path.startsWith("e2ee/hints/"))
            throw invalidFrame();
        return undefined;
    }
    if (!["raw", "raw-if-not-exists", "cas", "cad"].includes(operation)) {
        throw new GraftProtocolError(409, "profile_mismatch", "Plain semantic operation is disabled for encrypted repositories");
    }
    if (path === undefined)
        throw invalidFrame();
    validateKey(path);
    if (operation === "raw") {
        if (request.method !== "GET" && request.method !== "HEAD") {
            throw new GraftProtocolError(405, "encrypted_mutation_requires_condition", "Encrypted writes require create, CAS or CAD");
        }
        return undefined;
    }
    if ((operation === "cas" || operation === "cad") && !transactional(path)) {
        throw new GraftProtocolError(400, "invalid_transactional_path", "Encrypted CAS/CAD requires config or refs");
    }
    if (operation === "cad") {
        const expected = parseExpectedHeaders(request.headers);
        await readEncryptedBody(request, 0);
        if (!(await backend.compareAndDelete(path, expected)))
            throw compareFailed();
        return emptyResponse();
    }
    const maximum = transactional(path)
        ? Math.min(16 * 1024, requestLimit ?? 16 * 1024)
        : requestLimit;
    enforceDeclaredLimit(request, maximum);
    return transactional(path)
        ? mutateEncryptedObject(request, backend, operation, path, maximum)
        : createEncryptedObject(request, backend, path, requestLimit, routing);
}
function enforceDeclaredLimit(request, maximum) {
    if (maximum !== undefined && request.headers.has("content-length")) {
        const size = Number(request.headers.get("content-length"));
        if (!Number.isSafeInteger(size) || size < 0 || size > maximum) {
            throw new GraftProtocolError(413, "request_too_large", "Encrypted request exceeds its byte limit");
        }
    }
}
async function createEncryptedObject(request, backend, path, requestLimit, routing) {
    const body = path.startsWith("e2ee/hints/")
        ? await readEncryptedBody(request, Math.min(requestLimit ?? 1024 * 1024, 1024 * 1024))
        : validatedObjectBody(request, requestLimit);
    const hint = body instanceof Uint8Array ? validateHintFrame(path, body, backend.encryption) : undefined;
    const created = await backend.putIfAbsent(path, body, "immutable", {
        contentLength: declaredLength(request),
        ...(hint === undefined ? {} : { routingHint: hint }),
    });
    if (!created) {
        if (body instanceof ReadableStream && !body.locked)
            await body.cancel();
        throw new GraftProtocolError(412, "precondition_failed", "Immutable encrypted object already exists");
    }
    if (hint !== undefined && backend.encryptedRouting === undefined)
        routing?.add(hint);
    return emptyResponse();
}
async function mutateEncryptedObject(request, backend, operation, path, maximum) {
    const value = await readEncryptedBody(request, maximum);
    validateMutableFrame(path, value, backend.encryption);
    const success = operation === "cas"
        ? await backend.compareAndSwap(path, parseExpectedHeaders(request.headers), value)
        : await backend.putIfAbsent(path, value, "transactional");
    if (!success) {
        if (operation === "cas")
            throw compareFailed();
        throw new GraftProtocolError(412, "precondition_failed", "Encrypted mutable object already exists");
    }
    return emptyResponse();
}
function validateMutableFrame(key, value, descriptor) {
    const magic = key === "e2ee/config" ? "GRAFTEC1" : "GRAFTER1";
    if (value.length < 12 ||
        encoder.encode(magic).some((b, i) => value[i] !== b) ||
        value[8] !== 0 ||
        value[9] !== 1 ||
        value[10] !== 0 ||
        value[11] !== 1)
        throw invalidFrame();
    if (key === "e2ee/config") {
        const uuid = descriptor.uuid.replaceAll("-", "");
        if (value.length !== 206 ||
            value
                .subarray(12, 28)
                .some((b, i) => b !== Number.parseInt(uuid.slice(i * 2, i * 2 + 2), 16)) ||
            value.subarray(28, 36).every((b) => b === 0) ||
            value[68] !== 0 ||
            value[69] !== 1)
            throw invalidFrame();
    }
    else if (value.length < 85 ||
        (value[12] !== 1 &&
            !(value[12] === 2 && key.startsWith("e2ee/head/")) &&
            !(value[12] === 3 && key.startsWith("e2ee/refs/")))) {
        throw invalidFrame();
    }
}
function invalidFrame() {
    return new GraftProtocolError(400, "invalid_encrypted_frame", "Invalid encrypted mutable envelope");
}
function compareFailed() {
    return new GraftProtocolError(409, "compare_failed", "Encrypted object changed during compare");
}
function refKey(path) {
    if (path === undefined || !/^e2ee\/refs\/[0-9a-f]{64}$/.test(path))
        throw invalidBundle();
    return path;
}
async function objectBytes(backend, key, maximum) {
    const object = await backend.get(key);
    if (object === null)
        throw new GraftProtocolError(404, "object_not_found", "Encrypted object not found");
    if (!Number.isSafeInteger(object.size) || object.size < 0 || object.size > maximum)
        throw hintUnavailable();
    const reader = new EncryptedBodyReader(objectStream(object), object.size);
    try {
        const bytes = await reader.take(object.size);
        await reader.finish();
        return bytes;
    }
    finally {
        await reader.close();
    }
}
async function refreshRouting(backend, routing) {
    let after;
    let count = 0;
    let bytes = 0;
    for (;;) {
        const page = await backend.list({ prefix: "e2ee/hints/", after, limit: 256 });
        if (page.paths.length > 256 || (page.hasMore && page.paths.length === 0))
            throw hintUnavailable();
        for (const key of page.paths) {
            if (!/^e2ee\/hints\/[0-9a-f]{64}$/.test(key) ||
                (after !== undefined && bytewiseCompare(key, after) <= 0) ||
                ++count > 100_000)
                throw hintUnavailable();
            after = key;
            if (routing.hints.has(key))
                continue;
            const value = await objectBytes(backend, key, 1024 * 1024);
            bytes += value.length;
            if (bytes > 64 * 1024 * 1024)
                throw hintUnavailable();
            routing.add(validateHintFrame(key, value, backend.encryption));
        }
        if (!page.hasMore)
            return;
    }
}
async function fetchBundle(request, backend, path, routing, requestLimit) {
    const key = refKey(path);
    let record;
    try {
        record = parseControlJson(decoder.decode(await readEncryptedBody(request, Math.min(1024, requestLimit ?? 1024))));
    }
    catch (error) {
        if (error instanceof GraftProtocolError)
            throw error;
        throw invalidBundle();
    }
    if (typeof record !== "object" || record === null || Array.isArray(record))
        throw invalidBundle();
    const control = record;
    if (Object.keys(control).length !== 2 ||
        control.version !== 1 ||
        !(control.have === null ||
            (typeof control.have === "string" && /^[0-9a-f]{64}$/.test(control.have))))
        throw invalidBundle();
    const observed = await objectBytes(backend, key, 16 * 1024);
    validateMutableFrame(key, observed, backend.encryption);
    const target = Array.from(observed.subarray(13, 45), (b) => b.toString(16).padStart(2, "0")).join("");
    let hints;
    if (backend.encryptedRouting !== undefined) {
        const selected = await backend.encryptedRouting.select(target, control.have);
        if (selected === null)
            throw hintUnavailable();
        if (selected.length > 128 ||
            selected.some((hint) => !/^e2ee\/hints\/[0-9a-f]{64}$/.test(hint.key) ||
                !/^e2ee\/packs\/[0-9a-f]{64}$/.test(hint.pack) ||
                !/^e2ee\/indexes\/[0-9a-f]{64}$/.test(hint.index)))
            throw invalidBackend();
        hints = selected;
    }
    else {
        try {
            hints = routing.select(target, control.have);
        }
        catch {
            await refreshRouting(backend, routing);
            hints = routing.select(target, control.have);
        }
    }
    const keys = [...new Set(hints.flatMap((hint) => [hint.pack, hint.index, hint.key]))];
    let response;
    try {
        response = await bundleResponse(backend, keys, key, observed, 48 * 1024 * 1024);
    }
    catch (error) {
        if (error instanceof GraftProtocolError && (error.status === 404 || error.status === 413))
            throw hintUnavailable();
        throw error;
    }
    try {
        const current = await objectBytes(backend, key, 16 * 1024);
        if (!bytesEqual(observed, current))
            throw compareFailed();
    }
    catch (error) {
        await response.body?.cancel();
        if (error instanceof GraftProtocolError && error.status === 404)
            throw compareFailed();
        throw error;
    }
    return response;
}
/** A single bounded reader owns request bytes; immutable frame bodies are streamed. */
class EncryptedBodyReader {
    length;
    #reader;
    #pending = new Uint8Array(0);
    #received = 0;
    constructor(stream, length) {
        this.length = length;
        this.#reader = stream.getReader();
    }
    async take(length) {
        if (!Number.isSafeInteger(length) || length < 0 || length > this.length - this.#received)
            throw invalidFrame();
        const output = new Uint8Array(length);
        let offset = 0;
        while (offset < length) {
            if (this.#pending.length === 0) {
                const next = await this.#reader.read();
                if (next.done)
                    throw invalidFrame();
                // Retain the stream's read-only view. Copy only the requested bounded
                // output below, not an arbitrarily large transport chunk a second time.
                this.#pending = next.value;
                if (this.#pending.length > this.length - this.#received)
                    throw invalidFrame();
            }
            const count = Math.min(length - offset, this.#pending.length);
            output.set(this.#pending.subarray(0, count), offset);
            this.#pending = this.#pending.subarray(count);
            this.#received += count;
            offset += count;
        }
        return output;
    }
    frame(length) {
        let remaining = length;
        return {
            body: new ReadableStream({
                pull: async (controller) => {
                    if (remaining === 0) {
                        controller.close();
                        return;
                    }
                    const bytes = await this.take(Math.min(remaining, 64 * 1024));
                    remaining -= bytes.length;
                    controller.enqueue(bytes);
                },
            }, { highWaterMark: 0 }),
            consumed: () => remaining === 0,
        };
    }
    async finish() {
        if (this.#received !== this.length || this.#pending.length !== 0)
            throw invalidFrame();
        for (;;) {
            const next = await this.#reader.read();
            if (next.done)
                return;
            if (next.value.length !== 0)
                throw invalidFrame();
        }
    }
    async close() {
        await this.#reader.cancel().catch(() => undefined);
        this.#reader.releaseLock();
    }
}
function safeInteger(bytes, width) {
    if (bytes.length !== width)
        throw invalidBundle();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const value = width === 4 ? view.getUint32(0) : Number(view.getBigUint64(0));
    if (!Number.isSafeInteger(value))
        throw invalidBundle();
    return value;
}
async function equalStream(left, right, length) {
    const candidate = new EncryptedBodyReader(left, length);
    const existing = new EncryptedBodyReader(objectStream(right), right.size);
    try {
        if (right.size !== length)
            return false;
        for (let offset = 0; offset < length; offset += 64 * 1024) {
            const size = Math.min(64 * 1024, length - offset);
            if (!bytesEqual(await candidate.take(size), await existing.take(size)))
                return false;
        }
        await candidate.finish();
        await existing.finish();
        return true;
    }
    finally {
        await candidate.close();
        await existing.close();
    }
}
async function receiveImmutable(backend, key, length, source) {
    const frame = source.frame(length);
    const request = new Request("https://encrypted.invalid", {
        method: "PUT",
        headers: { "content-length": String(length) },
        body: frame.body,
        // Node requires duplex for streaming; fetch/Workers ignore this extension.
        ...{ duplex: "half" },
    });
    let validated = false;
    const body = validatedObjectBody(request, length, () => {
        validated = true;
    });
    const existing = await backend.get(key);
    if (existing !== null) {
        if (!(await equalStream(body, existing, length)))
            throw immutableConflict();
    }
    else {
        const created = await backend.putIfAbsent(key, body, "immutable", { contentLength: length });
        if (!created) {
            if (!body.locked)
                await body.cancel();
            throw immutableConflict();
        }
        if (!frame.consumed() || !validated)
            throw invalidBackend();
    }
}
function immutableConflict() {
    return new GraftProtocolError(412, "precondition_failed", "Immutable encrypted ciphertext differs");
}
async function receiveBundle(request, backend, path, routing, requestLimit) {
    const key = refKey(path);
    if (request.headers.get("content-type") !== "application/vnd.graft.e2ee-bundle")
        throw invalidBundle();
    const expected = parseExpectedHeaders(request.headers);
    const length = declaredLength(request);
    if (length > Math.min(MAX_BUNDLE_BYTES, requestLimit ?? MAX_BUNDLE_BYTES))
        throw new GraftProtocolError(413, "encrypted_bundle_too_large", "Encrypted receive exceeds its byte limit");
    if (request.body === null)
        throw invalidBundle();
    const source = new EncryptedBodyReader(request.body, length);
    try {
        const prefix = await source.take(12);
        if (decoder.decode(prefix.subarray(0, 8)) !== "GRAFTEB1")
            throw invalidBundle();
        const manifestLength = safeInteger(prefix.subarray(8), 4);
        if (manifestLength > MAX_MANIFEST_BYTES)
            throw invalidBundle();
        const fields = decodeFields(await source.take(manifestLength), 4);
        if (fields.length !== 4 ||
            fields[0].length !== 2 ||
            fields[0][0] !== 0 ||
            fields[0][1] !== 1 ||
            decoder.decode(fields[1]) !== key ||
            fields[2].length > 16 * 1024)
            throw invalidBundle();
        const replacement = new Uint8Array(fields[2]);
        validateMutableFrame(key, replacement, backend.encryption);
        let previous = "";
        let total = 12 + manifestLength;
        const frames = decodeFields(fields[3], 256).map((entry) => {
            const descriptor = decodeFields(entry, 2);
            if (descriptor.length !== 2)
                throw invalidBundle();
            const frameKey = decoder.decode(descriptor[0]);
            validateKey(frameKey, true);
            if (bytewiseCompare(previous, frameKey) >= 0)
                throw invalidBundle();
            previous = frameKey;
            const size = safeInteger(descriptor[1], 8);
            total += 12 + descriptor[0].length + size;
            if (!Number.isSafeInteger(total) || total > length)
                throw invalidBundle();
            return { key: frameKey, size };
        });
        if (total !== length)
            throw invalidBundle();
        for (const frame of frames) {
            const header = await source.take(12);
            const keyLength = safeInteger(header.subarray(0, 4), 4);
            if (keyLength !== encoder.encode(frame.key).length ||
                safeInteger(header.subarray(4), 8) !== frame.size ||
                decoder.decode(await source.take(keyLength)) !== frame.key)
                throw invalidBundle();
            if (frame.key.startsWith("e2ee/hints/")) {
                if (frame.size > 1024 * 1024)
                    throw invalidBundle();
                const bytes = await source.take(frame.size);
                const hint = validateHintFrame(frame.key, bytes, backend.encryption);
                if (!(await backend.putIfAbsent(frame.key, bytes, "immutable", {
                    contentLength: bytes.length,
                    routingHint: hint,
                })) &&
                    !bytesEqual(bytes, await objectBytes(backend, frame.key, 1024 * 1024)))
                    throw immutableConflict();
                if (backend.encryptedRouting === undefined)
                    routing.add(hint);
            }
            else {
                await receiveImmutable(backend, frame.key, frame.size, source);
            }
        }
        await source.finish();
        if (!(await backend.compareAndSwap(key, expected, replacement)))
            throw compareFailed();
        return emptyResponse();
    }
    finally {
        await source.close();
    }
}
async function readBundle(request, backend, requestLimit) {
    const body = await readEncryptedBody(request, Math.min(MAX_MANIFEST_BYTES, requestLimit ?? MAX_MANIFEST_BYTES));
    let record;
    try {
        record = parseControlJson(decoder.decode(body));
    }
    catch {
        throw invalidBundle();
    }
    if (typeof record !== "object" || record === null || Array.isArray(record))
        throw invalidBundle();
    const value = record;
    if (value.version !== 1 ||
        !Array.isArray(value.keys) ||
        value.keys.length === 0 ||
        value.keys.length > 256 ||
        Object.keys(value).some((k) => k !== "version" && k !== "keys"))
        throw invalidBundle();
    const keys = [];
    for (const key of value.keys) {
        if (typeof key !== "string" || keys.includes(key))
            throw invalidBundle();
        validateKey(key, true);
        keys.push(key);
    }
    return bundleResponse(backend, keys, "", new Uint8Array(), MAX_BUNDLE_BYTES);
}
async function bundleResponse(backend, keys, referenceKey, referenceBytes, maximum) {
    keys.sort(bytewiseCompare);
    const objects = [];
    // Four probes at a time; object bodies are opened only while streaming.
    for (let offset = 0; offset < keys.length; offset += 4) {
        const batch = await Promise.all(keys.slice(offset, offset + 4).map(async (key) => {
            const metadata = await backend.head(key);
            if (metadata === null)
                throw new GraftProtocolError(404, "object_not_found", "Encrypted object not found");
            if (!Number.isSafeInteger(metadata.size) || metadata.size < 0)
                throw invalidBackend();
            return { key, size: metadata.size };
        }));
        objects.push(...batch);
    }
    const descriptors = encode(objects.map(({ key, size }) => encode([encoder.encode(key), integer(size, 8)])));
    const manifest = encode([
        integer(1, 2),
        encoder.encode(referenceKey),
        referenceBytes,
        descriptors,
    ]);
    if (manifest.length > MAX_MANIFEST_BYTES)
        throw invalidBundle();
    const start = concat([encoder.encode("GRAFTEB1"), integer(manifest.length, 4), manifest]);
    let total = start.length;
    for (const { key, size } of objects) {
        total += 12 + encoder.encode(key).length + size;
        if (!Number.isSafeInteger(total) || total > maximum) {
            throw new GraftProtocolError(413, "encrypted_bundle_too_large", "Encrypted bundle exceeds its byte limit");
        }
    }
    return new Response(bundleStream(backend, objects, start), {
        headers: protocolHeaders({
            "Content-Type": "application/vnd.graft.e2ee-bundle",
            "Content-Length": String(total),
            "x-graft-bundle-objects": String(objects.length),
            "x-graft-bundle-total-bytes": String(total),
        }),
    });
}
function bundleStream(backend, objects, start) {
    let reader;
    async function* chunks() {
        yield start;
        for (const { key, size } of objects) {
            const object = await backend.get(key);
            if (object === null || object.size !== size)
                throw invalidBackend();
            reader = objectStream(object).getReader();
            let count = 0;
            try {
                yield concat([
                    integer(encoder.encode(key).length, 4),
                    integer(size, 8),
                    encoder.encode(key),
                ]);
                for (;;) {
                    const next = await reader.read();
                    if (next.done)
                        break;
                    count += next.value.length;
                    if (count > size)
                        throw invalidBackend();
                    const bytes = next.value;
                    yield bytes.buffer instanceof ArrayBuffer
                        ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
                        : new Uint8Array(bytes);
                }
                if (count !== size)
                    throw invalidBackend();
            }
            finally {
                await reader.cancel();
                reader.releaseLock();
                reader = undefined;
            }
        }
    }
    const iterator = chunks();
    return new ReadableStream({
        async pull(controller) {
            try {
                const next = await iterator.next();
                if (next.done)
                    controller.close();
                else
                    controller.enqueue(next.value);
            }
            catch (error) {
                controller.error(error);
            }
        },
        async cancel(reason) {
            await reader?.cancel(reason);
            await iterator.return(undefined);
        },
    });
}
function objectStream(object) {
    if (object.body instanceof ReadableStream)
        return object.body;
    const bytes = object.body instanceof ArrayBuffer ? new Uint8Array(object.body) : object.body;
    return new ReadableStream({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
}
function validatedObjectBody(request, maximum, onComplete) {
    const declared = declaredLength(request);
    if (request.body === null)
        throw invalidFrame();
    let total = 0;
    let filled = 0;
    let minimum = 0;
    const prefix = new Uint8Array(72);
    return request.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
            total += chunk.byteLength;
            if (!Number.isSafeInteger(total) ||
                total > declared ||
                (maximum !== undefined && total > maximum))
                throw new GraftProtocolError(413, "request_too_large", "Encrypted request exceeds its byte limit");
            if (filled === prefix.length) {
                controller.enqueue(chunk);
                return;
            }
            const take = Math.min(prefix.length - filled, chunk.length);
            prefix.set(chunk.subarray(0, take), filled);
            filled += take;
            if (filled === prefix.length) {
                if (encoder.encode("GRAFTEO1").some((b, i) => b !== prefix[i]) ||
                    prefix[8] !== 0 ||
                    prefix[9] !== 1 ||
                    prefix[10] !== 0 ||
                    prefix[11] !== 1)
                    throw invalidFrame();
                const headerLength = new DataView(prefix.buffer).getUint32(68);
                if (headerLength < 16 || headerLength > 16384)
                    throw invalidFrame();
                minimum = prefix.length + headerLength + 16;
                if (declared < minimum)
                    throw invalidFrame();
                controller.enqueue(prefix);
                if (take < chunk.length)
                    controller.enqueue(chunk.subarray(take));
            }
        },
        flush() {
            if (filled !== prefix.length || total !== declared || total < minimum)
                throw invalidFrame();
            onComplete?.();
        },
    }));
}
function declaredLength(request) {
    const text = request.headers.get("content-length");
    if (request.body === null && text === null)
        return 0;
    if (text === null || !/^[0-9]+$/.test(text) || !Number.isSafeInteger(Number(text))) {
        throw new GraftProtocolError(411, "encrypted_length_required", "Encrypted body requires exact Content-Length");
    }
    return Number(text);
}
async function readEncryptedBody(request, maximum) {
    const declared = declaredLength(request);
    const bytes = await readLimitedBody(request, maximum);
    if (bytes.length !== declared)
        throw invalidFrame();
    return bytes;
}
function parseControlJson(text) {
    const value = JSON.parse(text);
    const seen = new Set();
    let depth = 0;
    for (let offset = 0; offset < text.length; offset += 1) {
        const character = text[offset];
        if (character === '"') {
            const start = offset;
            for (offset += 1; offset < text.length; offset += 1) {
                if (text[offset] === "\\")
                    offset += 1;
                else if (text[offset] === '"')
                    break;
            }
            if (depth === 1 && /^\s*:/.test(text.slice(offset + 1))) {
                const key = JSON.parse(text.slice(start, offset + 1));
                if (seen.has(key))
                    throw invalidBundle();
                seen.add(key);
            }
        }
        else if (character === "{" || character === "[")
            depth += 1;
        else if (character === "}" || character === "]")
            depth -= 1;
    }
    return value;
}
function decodeFields(bytes, maximum) {
    if (bytes.length < 2)
        throw invalidFrame();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint16(0);
    if (count > maximum)
        throw invalidFrame();
    const fields = [];
    let offset = 2;
    for (let i = 0; i < count; i += 1) {
        if (offset + 4 > bytes.length)
            throw invalidFrame();
        const length = view.getUint32(offset);
        offset += 4;
        if (offset + length > bytes.length)
            throw invalidFrame();
        fields.push(bytes.subarray(offset, offset + length));
        offset += length;
    }
    if (offset !== bytes.length)
        throw invalidFrame();
    return fields;
}
/** Checks public framing only. It cannot authenticate a hint MAC or pack contents. */
export function parseEncryptedRoutingHint(key, bytes, identity) {
    validateEncryptionDescriptor(identity);
    if (!/^e2ee\/hints\/[0-9a-f]{64}$/.test(key))
        throw invalidFrame();
    return validateHintFrame(key, bytes, identity);
}
function validateHintFrame(key, bytes, identity) {
    if (bytes.length < 60 ||
        bytes.length > 1024 * 1024 ||
        encoder.encode("GRAFTEH1").some((b, i) => b !== bytes[i]) ||
        bytes[8] !== 0 ||
        bytes[9] !== 1 ||
        bytes[10] !== 0 ||
        bytes[11] !== 1)
        throw invalidFrame();
    const uuid = identity.uuid.replaceAll("-", "");
    if (bytes.subarray(12, 28).some((b, i) => b !== Number.parseInt(uuid.slice(i * 2, i * 2 + 2), 16)))
        throw invalidFrame();
    const fields = decodeFields(bytes.subarray(28, -32), 3);
    if (fields.length !== 3)
        throw invalidFrame();
    let pack, index;
    try {
        pack = decoder.decode(fields[0]);
        index = decoder.decode(fields[1]);
    }
    catch {
        throw invalidFrame();
    }
    if (pack !== key.replace("e2ee/hints/", "e2ee/packs/") ||
        !/^e2ee\/indexes\/[0-9a-f]{64}$/.test(index))
        throw invalidFrame();
    let previous = "";
    const commits = [];
    for (const entry of decodeFields(fields[2], 4096)) {
        const commit = decodeFields(entry, 2);
        if (commit.length !== 2 || commit[0].length !== 32)
            throw invalidFrame();
        const token = Array.from(commit[0], (b) => b.toString(16).padStart(2, "0")).join("");
        if (token <= previous)
            throw invalidFrame();
        previous = token;
        const seen = new Set();
        const parents = [];
        for (const parent of decodeFields(commit[1], 32)) {
            if (parent.length !== 32)
                throw invalidFrame();
            const token = Array.from(parent, (b) => b.toString(16).padStart(2, "0")).join("");
            if (seen.has(token))
                throw invalidFrame();
            seen.add(token);
            parents.push(token);
        }
        commits.push({ token, parents });
    }
    return { key, pack, index, commits };
}
function integer(value, width) {
    const bytes = new Uint8Array(width);
    const view = new DataView(bytes.buffer);
    if (width === 2)
        view.setUint16(0, value);
    else if (width === 4)
        view.setUint32(0, value);
    else
        view.setBigUint64(0, BigInt(value));
    return bytes;
}
function encode(fields) {
    return concat([
        integer(fields.length, 2),
        ...fields.flatMap((field) => [integer(field.length, 4), field]),
    ]);
}
function concat(parts) {
    const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
    }
    return bytes;
}
function invalidBundle() {
    return new GraftProtocolError(400, "invalid_encrypted_bundle", "Invalid encrypted read-bundle request");
}
function invalidBackend() {
    return new GraftProtocolError(500, "invalid_backend", "Encrypted object metadata or body changed");
}
//# sourceMappingURL=encrypted.js.map