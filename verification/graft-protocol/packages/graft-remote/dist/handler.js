import { GRAFT_REMOTE_CAPABILITIES, MAX_LIST_LIMIT, MAX_METADATA_BYTES, MAX_READ_BUNDLE_OBJECTS, MAX_UPLOAD_BUNDLE_OBJECTS, MULTIPART_HEADER_OBJECT_BYTES, MULTIPART_HEADER_PART_NUMBER, MULTIPART_HEADER_UPLOAD_ID, PROTOCOL_HEADER, PROTOCOL_VERSION, RECEIVE_BUNDLE_HEADER_MANIFEST_BYTES, READ_BUNDLE_HEADER_OBJECTS, UPLOAD_BUNDLE_HEADER_TOTAL_BYTES, GraftProtocolError, bytewiseCompare, bytesEqual, emptyResponse, encodeListCursor, errorResponse, isImmutablePath, isTransactionalPath, jsonResponse, parseExpectedHeaders, parseReceiveBundleManifest, parseReceiveBundleManifestLength, parseReceivePackHeaders, parseRangeHeader, protocolHeaders, readLimitedBody, rejectUnexpectedQuery, validateEncodedPath, validateListQuery, validateObjectPath, validateRepositorySegment, } from "./protocol.js";
import { encryptedOperation, validateEncryptionDescriptor, validateEncryptionTransport, ENCRYPTED_CAPABILITIES, } from "./encrypted.js";
import { EncryptedRoutingIndex } from "./encrypted-routing.js";
const OPERATIONS = new Set([
    "raw",
    "raw-if-not-exists",
    "read-bundle",
    "fetch-bundle",
    "upload-bundle",
    "receive-pack",
    "receive-bundle",
    "multipart-start",
    "multipart-part",
    "multipart-complete",
    "multipart-abort",
    "cas",
    "cad",
    "list",
]);
const UPLOAD_BUNDLE_PREFETCH_OBJECTS = 8;
const MAX_FETCH_BUNDLE_PACKS = 128;
const MAX_FETCH_BUNDLE_INDEX_BYTES = 8 * 1024 * 1024;
const MAX_FETCH_BUNDLE_RESPONSE_BYTES = 48 * 1024 * 1024;
const DEFAULT_MULTIPART_PART_BYTES = 16 * 1024 * 1024;
const MAX_MULTIPART_PARTS = 10_000;
export function createGraftRemoteHandler(options) {
    const limits = normalizeRemoteLimits(options.limits);
    const encryptedRouting = new Map();
    return async (request) => {
        try {
            return await handleRequest(request, options, limits, encryptedRouting);
        }
        catch (error) {
            if (options.onError !== undefined) {
                try {
                    await options.onError(error, request);
                }
                catch {
                    console.error(JSON.stringify({
                        message: "graft remote error reporter failed",
                    }));
                }
            }
            if (!(error instanceof GraftProtocolError)) {
                console.error(JSON.stringify({ message: "unhandled graft remote error" }));
            }
            return errorResponse(error);
        }
    };
}
async function handleRequest(input, options, limits, encryptedRouting) {
    const principal = await options.authenticate?.(input);
    if (input.request.headers.get(PROTOCOL_HEADER) !== PROTOCOL_VERSION) {
        throw new GraftProtocolError(426, "unsupported_protocol", `This service requires ${PROTOCOL_HEADER}: ${PROTOCOL_VERSION}`);
    }
    const url = new URL(input.request.url);
    validateEncodedPath(url);
    const parameters = input.route;
    const namespace = validateRepositorySegment(parameters.namespace ?? "");
    const name = validateRepositorySegment(parameters.repository ?? "");
    const repositoryWithoutId = { namespace, name };
    const id = options.repositoryId === undefined
        ? `${namespace}/${name}`
        : await options.repositoryId(repositoryWithoutId, input);
    if (id.length === 0 || /[\u0000-\u001f\u007f]/.test(id)) {
        throw new GraftProtocolError(500, "invalid_repository_id", "Backend returned an invalid repository id");
    }
    const repository = { ...repositoryWithoutId, id };
    const encryptedRoute = parameters.operation === "e2ee";
    const [encryptedAction, ...encryptedPath] = (parameters.objectPath ?? "").split("/");
    const operation = encryptedRoute
        ? encryptedAction === "read-bundle"
            ? "e2ee-read-bundle"
            : encryptedAction === "fetch-bundle"
                ? "e2ee-fetch-bundle"
                : encryptedAction === "receive-bundle"
                    ? "e2ee-receive-bundle"
                    : parseOperation(parameters.operation)
        : parseOperation(parameters.operation);
    const objectPath = parseObjectPath(operation, encryptedRoute
        ? encryptedPath.length === 0
            ? undefined
            : encryptedPath.join("/")
        : parameters.objectPath);
    const action = validateMethodAndAction(input.request.method, operation);
    const requestContext = {
        request: input.request,
        adapterContext: input.adapterContext,
        repository,
        operation,
        action,
        principal,
        ...(objectPath === undefined ? {} : { objectPath }),
    };
    await options.authorize?.(requestContext);
    const backend = await options.backend(requestContext);
    if (backend === null) {
        throw new GraftProtocolError(404, "repository_not_found", "Repository not found");
    }
    if (backend.encryption !== undefined) {
        validateEncryptionDescriptor(backend.encryption);
        validateEncryptionTransport(url);
    }
    if (operation === "descriptor") {
        rejectUnexpectedQuery(url);
        const capabilities = backend.encryption === undefined
            ? [...GRAFT_REMOTE_CAPABILITIES]
            : [...ENCRYPTED_CAPABILITIES];
        if (backend.encryption === undefined && backend.multipart !== undefined)
            capabilities.push("multipart-object");
        if (backend.encryption !== undefined && backend.multipart?.supportsEncryption === true)
            capabilities.push("e2ee-multipart-object");
        return jsonResponse({
            protocol: "graft-remote",
            version: 1,
            repository: repository.id,
            ...(backend.encryption === undefined
                ? {}
                : {
                    encryption: {
                        profile: backend.encryption.profile,
                        version: backend.encryption.version,
                        suite: backend.encryption.suite,
                        uuid: backend.encryption.uuid,
                    },
                }),
            capabilities,
            limits: {
                ...(limits.maxRequestBytes === undefined
                    ? {}
                    : { max_request_bytes: limits.maxRequestBytes }),
                ...(backend.multipart === undefined ||
                    (backend.encryption !== undefined && backend.multipart.supportsEncryption !== true)
                    ? {}
                    : { multipart_part_bytes: limits.multipartPartBytes }),
            },
        });
    }
    if (backend.encryption !== undefined) {
        const identity = `${repository.id}\0${backend.encryption.uuid}`;
        let routing = encryptedRouting.get(identity);
        if (routing === undefined) {
            if (encryptedRouting.size >= 4)
                encryptedRouting.delete(encryptedRouting.keys().next().value);
            routing = new EncryptedRoutingIndex();
        }
        else {
            encryptedRouting.delete(identity);
        }
        encryptedRouting.set(identity, routing);
        const response = await encryptedOperation(input.request, backend, operation, objectPath, url, limits.maxRequestBytes, routing);
        if (response !== undefined)
            return response;
    }
    else if (operation.startsWith("e2ee-")) {
        throw new GraftProtocolError(409, "profile_mismatch", "Encrypted operation requires an encrypted remote");
    }
    if (operation === "list") {
        return listObjects(backend, url);
    }
    rejectUnexpectedQuery(url);
    enforceRequestLimit(input.request.headers, limits.maxRequestBytes);
    if (operation === "read-bundle") {
        return readBundle(input.request, backend);
    }
    const path = objectPath;
    switch (operation) {
        case "raw":
            return raw(input.request, backend, path);
        case "raw-if-not-exists":
            return putIfAbsent(input.request, backend, path);
        case "fetch-bundle":
            return fetchBundle(input.request, backend, path);
        case "upload-bundle":
            return uploadBundle(backend, path);
        case "receive-pack":
            return receivePack(input.request, backend, path);
        case "receive-bundle":
            return receiveBundle(input.request, backend, path);
        case "multipart-start":
            return startMultipartUpload(input.request, backend, path, limits.multipartPartBytes);
        case "multipart-part":
            return uploadMultipartPart(input.request, backend, path, limits.multipartPartBytes);
        case "multipart-complete":
            return completeMultipartUpload(input.request, backend, path);
        case "multipart-abort":
            return abortMultipartUpload(input.request, backend, path);
        case "cas":
            return compareAndSwap(input.request, backend, path);
        case "cad":
            return compareAndDelete(input.request, backend, path);
        case "e2ee-read-bundle":
        case "e2ee-fetch-bundle":
        case "e2ee-receive-bundle":
            throw new GraftProtocolError(500, "invalid_dispatch", "Encrypted operation was not handled");
    }
}
function parseOperation(value) {
    if (value === undefined) {
        return "descriptor";
    }
    if (!OPERATIONS.has(value)) {
        throw new GraftProtocolError(404, "operation_not_found", "Unknown remote protocol operation");
    }
    return value;
}
function parseObjectPath(operation, value) {
    if (operation === "descriptor" ||
        operation === "list" ||
        operation === "read-bundle" ||
        operation === "e2ee-read-bundle") {
        if (value !== undefined) {
            throw new GraftProtocolError(400, "invalid_list_path", "The operation has no path suffix");
        }
        return undefined;
    }
    if (value === undefined) {
        throw new GraftProtocolError(400, "missing_object_path", "The operation requires an object path");
    }
    return validateObjectPath(value);
}
function validateMethodAndAction(method, operation) {
    switch (operation) {
        case "descriptor":
            requireMethod(method, "GET");
            return "discover";
        case "list":
            requireMethod(method, "GET");
            return "read";
        case "read-bundle":
        case "e2ee-read-bundle":
        case "e2ee-fetch-bundle":
            requireMethod(method, "POST");
            return "read";
        case "raw":
            if (method === "GET" || method === "HEAD") {
                return "read";
            }
            if (method === "PUT" || method === "DELETE") {
                return "write";
            }
            throw methodNotAllowed("GET, HEAD, PUT, DELETE");
        case "raw-if-not-exists":
            requireMethod(method, "PUT");
            return "write";
        case "fetch-bundle":
        case "upload-bundle":
            requireMethod(method, "POST");
            return "read";
        case "receive-pack":
        case "receive-bundle":
        case "e2ee-receive-bundle":
            requireMethod(method, "POST");
            return "write";
        case "multipart-start":
        case "multipart-complete":
            requireMethod(method, "POST");
            return "write";
        case "multipart-part":
            requireMethod(method, "PUT");
            return "write";
        case "multipart-abort":
            requireMethod(method, "DELETE");
            return "write";
        case "cas":
        case "cad":
            requireMethod(method, "POST");
            return "write";
    }
}
async function startMultipartUpload(request, backend, path, partBytes) {
    requireImmutablePath(path);
    const multipart = requireMultipartBackend(backend);
    requireEmptyBody(request);
    const totalBytes = parsePositiveIntegerHeader(request.headers, MULTIPART_HEADER_OBJECT_BYTES);
    const parts = Math.ceil(totalBytes / partBytes);
    if (parts > MAX_MULTIPART_PARTS) {
        throw new GraftProtocolError(413, "multipart_object_too_large", `Multipart object requires more than ${MAX_MULTIPART_PARTS} parts`);
    }
    const encryption = backend.encryption === undefined
        ? undefined
        : {
            uuid: request.headers.get("x-graft-e2ee-uuid"),
            uploadId: request.headers.get("x-graft-e2ee-upload-id"),
            ciphertextSha256: request.headers.get("x-graft-e2ee-ciphertext-sha256"),
        };
    if (encryption !== undefined &&
        (encryption.uuid !== backend.encryption.uuid ||
            encryption.uploadId === null ||
            !/^[0-9a-f]{64}$/.test(encryption.uploadId) ||
            encryption.ciphertextSha256 === null ||
            !/^[0-9a-f]{64}$/.test(encryption.ciphertextSha256)))
        throw new GraftProtocolError(400, "invalid_encrypted_upload", "Encrypted multipart identity is invalid");
    const identity = encryption === undefined
        ? undefined
        : {
            uuid: encryption.uuid,
            uploadId: encryption.uploadId,
            ciphertextSha256: encryption.ciphertextSha256,
        };
    const upload = await multipart.start(path, totalBytes, partBytes, identity);
    if (upload === null) {
        throw new GraftProtocolError(412, "precondition_failed", "Object already exists");
    }
    validateMultipartUpload(upload, totalBytes, partBytes);
    if (identity !== undefined &&
        (upload.encryption?.uuid !== identity.uuid ||
            upload.encryption.uploadId !== identity.uploadId ||
            upload.encryption.ciphertextSha256 !== identity.ciphertextSha256))
        throw backendContractError("Encrypted multipart backend returned a different identity");
    return jsonResponse({
        upload_id: upload.uploadId,
        total_bytes: upload.totalBytes,
        part_bytes: upload.partBytes,
        ...(identity === undefined
            ? {}
            : {
                encryption: {
                    uuid: identity.uuid,
                    upload_id: identity.uploadId,
                    ciphertext_sha256: identity.ciphertextSha256,
                },
            }),
        uploaded_parts: upload.uploadedParts.map((part) => ({
            part_number: part.partNumber,
            bytes: part.bytes,
        })),
    });
}
async function uploadMultipartPart(request, backend, path, partBytes) {
    requireImmutablePath(path);
    const multipart = requireMultipartBackend(backend);
    const uploadId = parseUploadId(request.headers);
    const partNumber = parsePositiveIntegerHeader(request.headers, MULTIPART_HEADER_PART_NUMBER);
    if (partNumber > MAX_MULTIPART_PARTS) {
        throw new GraftProtocolError(400, "invalid_multipart_part", "Multipart part number is too large");
    }
    const contentLength = parseContentLengthHeader(request.headers);
    if (contentLength < 1 || contentLength > partBytes) {
        throw new GraftProtocolError(400, "invalid_multipart_part", "Multipart part Content-Length is outside the advertised part size");
    }
    if (request.body === null) {
        throw new GraftProtocolError(400, "invalid_multipart_part", "Multipart part body is missing");
    }
    await multipart.uploadPart(path, uploadId, partNumber, request.body, contentLength);
    return emptyResponse();
}
async function completeMultipartUpload(request, backend, path) {
    requireImmutablePath(path);
    requireEmptyBody(request);
    const created = await requireMultipartBackend(backend).complete(path, parseUploadId(request.headers));
    if (!created) {
        throw new GraftProtocolError(412, "precondition_failed", "Object already exists");
    }
    return emptyResponse();
}
async function abortMultipartUpload(request, backend, path) {
    requireImmutablePath(path);
    requireEmptyBody(request);
    await requireMultipartBackend(backend).abort(path, parseUploadId(request.headers));
    return emptyResponse();
}
async function raw(request, backend, path) {
    switch (request.method) {
        case "HEAD":
            return headObject(backend, path);
        case "GET":
            return getObject(request, backend, path);
        case "PUT": {
            if (isImmutablePath(path)) {
                throw methodNotAllowed("GET, HEAD");
            }
            const value = await readLimitedBody(request, MAX_METADATA_BYTES);
            await backend.put(path, value);
            return emptyResponse();
        }
        case "DELETE":
            if (isImmutablePath(path)) {
                throw methodNotAllowed("GET, HEAD");
            }
            await backend.delete(path);
            return emptyResponse();
        default:
            throw methodNotAllowed("GET, HEAD, PUT, DELETE");
    }
}
async function headObject(backend, path) {
    const metadata = await backend.head(path);
    if (metadata === null) {
        throw objectNotFound();
    }
    validateMetadata(metadata);
    return emptyResponse(200, objectHeaders(metadata));
}
async function getObject(request, backend, path) {
    const rangeHeader = request.headers.get("range");
    if (rangeHeader === null) {
        const object = await backend.get(path);
        if (object === null) {
            throw objectNotFound();
        }
        validateMetadata(object);
        return new Response(asBodyInit(object), {
            status: 200,
            headers: protocolHeaders(objectHeaders(object)),
        });
    }
    const metadata = await backend.head(path);
    if (metadata === null) {
        throw objectNotFound();
    }
    validateMetadata(metadata);
    const range = parseRangeHeader(rangeHeader, metadata.size);
    const object = await backend.get(path, range);
    if (object === null) {
        throw objectNotFound();
    }
    const headers = protocolHeaders(objectHeaders(metadata));
    headers.set("Content-Length", (range.end - range.start + 1).toString());
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${metadata.size}`);
    return new Response(asBodyInit(object), { status: 206, headers });
}
async function putIfAbsent(request, backend, path) {
    const transactional = isTransactionalPath(path);
    const body = transactional
        ? await readLimitedBody(request, MAX_METADATA_BYTES)
        : (request.body ?? new Uint8Array(new ArrayBuffer(0)));
    const created = await backend.putIfAbsent(path, body, transactional ? "transactional" : "immutable");
    if (!created) {
        throw new GraftProtocolError(412, "precondition_failed", "Object already exists");
    }
    return emptyResponse();
}
async function uploadBundle(backend, refPath) {
    requireTransactionalPath(refPath);
    const reference = await readMetadataObject(backend, refPath);
    if (reference === null)
        throw objectNotFound();
    const objects = await listImmutableObjects(backend);
    const confirmed = await readMetadataObject(backend, refPath);
    if (confirmed === null || !bytesEqual(reference, confirmed)) {
        throw new GraftProtocolError(409, "snapshot_changed", "Reference changed while preparing the upload bundle");
    }
    const manifest = new TextEncoder().encode(JSON.stringify({
        version: 1,
        reference: { path: refPath, value_hex: encodeLowerHex(reference) },
        objects: objects.length,
    }));
    const totalBytes = uploadBundleTotalBytes(manifest, objects);
    const headers = protocolHeaders({
        "Content-Length": totalBytes.toString(),
        "Content-Type": "application/vnd.graft.upload-bundle",
        [RECEIVE_BUNDLE_HEADER_MANIFEST_BYTES]: manifest.byteLength.toString(),
        [UPLOAD_BUNDLE_HEADER_TOTAL_BYTES]: totalBytes.toString(),
    });
    return new Response(new UploadBundleBody(backend, manifest, objects).stream, { headers });
}
async function fetchBundle(request, backend, refPath) {
    requireTransactionalPath(refPath);
    const have = await parseFetchBundleRequest(request);
    const reference = await readMetadataObject(backend, refPath);
    if (reference === null)
        throw objectNotFound();
    const head = decodeFetchBundleObjectId(reference, "reference");
    const selectedPaths = new Set();
    if (have !== head) {
        const indexes = await readFetchBundlePackIndexes(backend);
        const advertised = new Map();
        for (const index of indexes) {
            for (const commit of index.commits) {
                if (advertised.has(commit.id)) {
                    throw fetchBundleUnavailable("Pack ancestry advertises a commit more than once");
                }
                advertised.set(commit.id, { pack: index.pack, parents: commit.parents });
            }
        }
        const selectedPacks = new Set();
        const stack = [head];
        const seen = new Set();
        while (stack.length > 0) {
            const id = stack.pop();
            if (id === have || seen.has(id))
                continue;
            seen.add(id);
            const commit = advertised.get(id);
            if (commit === undefined) {
                throw fetchBundleUnavailable("Pack ancestry does not cover the requested history");
            }
            selectedPacks.add(commit.pack);
            if (selectedPacks.size > MAX_FETCH_BUNDLE_PACKS) {
                throw fetchBundleUnavailable("Requested history spans too many packs");
            }
            stack.push(...commit.parents);
        }
        for (const index of indexes) {
            if (!selectedPacks.has(index.pack))
                continue;
            selectedPaths.add(index.path);
            selectedPaths.add(index.pack);
        }
    }
    const paths = [...selectedPaths].sort(bytewiseCompare);
    const sizes = await resolveObjectSizes(backend, paths);
    const objects = paths.map((path) => {
        const size = sizes.get(path);
        if (size === undefined)
            throw fetchBundleUnavailable("Selected pack disappeared");
        return { path, size };
    });
    const manifest = new TextEncoder().encode(JSON.stringify({
        version: 1,
        reference: { path: refPath, value_hex: encodeLowerHex(reference) },
        objects: objects.length,
    }));
    const totalBytes = uploadBundleTotalBytes(manifest, objects);
    if (totalBytes > MAX_FETCH_BUNDLE_RESPONSE_BYTES) {
        throw fetchBundleUnavailable("Fetch bundle exceeds the aggregate size limit");
    }
    const confirmed = await readMetadataObject(backend, refPath);
    if (confirmed === null || !bytesEqual(reference, confirmed)) {
        throw new GraftProtocolError(409, "snapshot_changed", "Reference changed while preparing the fetch bundle");
    }
    const headers = protocolHeaders({
        "Content-Length": totalBytes.toString(),
        "Content-Type": "application/vnd.graft.fetch-bundle",
        [RECEIVE_BUNDLE_HEADER_MANIFEST_BYTES]: manifest.byteLength.toString(),
        [UPLOAD_BUNDLE_HEADER_TOTAL_BYTES]: totalBytes.toString(),
    });
    return new Response(new UploadBundleBody(backend, manifest, objects).stream, { headers });
}
async function parseFetchBundleRequest(request) {
    const bytes = await readLimitedBody(request, MAX_METADATA_BYTES);
    let value;
    try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    }
    catch {
        throw new GraftProtocolError(400, "invalid_fetch_bundle", "Invalid fetch-bundle manifest");
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new GraftProtocolError(400, "invalid_fetch_bundle", "Invalid fetch-bundle manifest");
    }
    const record = value;
    if (Object.keys(record).some((key) => key !== "version" && key !== "have") ||
        record.version !== 1 ||
        !(record.have === null || isObjectId(record.have))) {
        throw new GraftProtocolError(400, "invalid_fetch_bundle", "Invalid fetch-bundle manifest");
    }
    return record.have === null ? undefined : record.have;
}
async function readFetchBundlePackIndexes(backend) {
    const paths = await listPathsWithPrefix(backend, "objects/pack/");
    const indexPaths = paths.filter((path) => path.endsWith(".idx"));
    if (indexPaths.length > MAX_UPLOAD_BUNDLE_OBJECTS) {
        throw fetchBundleUnavailable("Repository contains too many pack indexes");
    }
    let next = 0;
    const indexes = [];
    const workers = Array.from({ length: Math.min(UPLOAD_BUNDLE_PREFETCH_OBJECTS, indexPaths.length) }, async () => {
        for (;;) {
            const path = indexPaths[next];
            next += 1;
            if (path === undefined)
                return;
            const object = await backend.get(path);
            if (object === null)
                throw fetchBundleUnavailable("Pack index disappeared");
            validateMetadata(object);
            if (object.size > MAX_FETCH_BUNDLE_INDEX_BYTES) {
                throw fetchBundleUnavailable("Pack index exceeds the fetch-bundle limit");
            }
            const bytes = await readObjectBody(object, MAX_FETCH_BUNDLE_INDEX_BYTES);
            if (bytes.byteLength !== object.size) {
                throw backendContractError("Backend pack index does not match its declared size");
            }
            indexes.push(decodeFetchBundlePackIndex(path, bytes));
        }
    });
    await Promise.all(workers);
    indexes.sort((left, right) => bytewiseCompare(left.path, right.path));
    return indexes;
}
async function listPathsWithPrefix(backend, prefix) {
    const paths = [];
    let after;
    for (;;) {
        const result = await backend.list({ prefix, after, limit: MAX_LIST_LIMIT });
        if (result.paths.length > MAX_LIST_LIMIT) {
            throw backendContractError("List backend returned more paths than requested");
        }
        for (const path of result.paths) {
            validateObjectPath(path);
            if (!path.startsWith(prefix) || (after !== undefined && bytewiseCompare(path, after) <= 0)) {
                throw backendContractError("List backend returned unsorted paths outside the prefix");
            }
            paths.push(path);
            after = path;
        }
        if (!result.hasMore)
            return paths;
        if (result.paths.length === 0) {
            throw backendContractError("List backend cannot advance the fetch-bundle cursor");
        }
    }
}
function decodeFetchBundlePackIndex(path, bytes) {
    let value;
    try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    }
    catch {
        throw fetchBundleUnavailable("Pack index is not valid JSON");
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw fetchBundleUnavailable("Pack index has an invalid shape");
    }
    const record = value;
    if (record.version !== 1 ||
        typeof record.pack !== "string" ||
        !record.pack.startsWith("objects/pack/") ||
        !record.pack.endsWith(".pack") ||
        !Array.isArray(record.commits)) {
        throw fetchBundleUnavailable("Pack index does not advertise compatible ancestry");
    }
    validateObjectPath(record.pack);
    const commits = record.commits.map((value) => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw fetchBundleUnavailable("Pack ancestry entry has an invalid shape");
        }
        const commit = value;
        if (!isObjectId(commit.id) ||
            !Array.isArray(commit.parents) ||
            !commit.parents.every(isObjectId)) {
            throw fetchBundleUnavailable("Pack ancestry entry contains an invalid object id");
        }
        return { id: commit.id, parents: commit.parents };
    });
    return { path, pack: record.pack, commits };
}
function decodeFetchBundleObjectId(bytes, source) {
    let value;
    try {
        value = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    }
    catch {
        throw fetchBundleUnavailable(`The ${source} is not UTF-8`);
    }
    if (!isObjectId(value))
        throw fetchBundleUnavailable(`The ${source} is not an object id`);
    return value;
}
function isObjectId(value) {
    return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
function fetchBundleUnavailable(message) {
    return new GraftProtocolError(422, "fetch_bundle_unavailable", message);
}
const MAX_READ_BUNDLE_MANIFEST_BYTES = 256 * 1024;
const MAX_READ_BUNDLE_RESPONSE_BYTES = 64 * 1024 * 1024;
async function readBundle(request, backend) {
    const manifest = await readLimitedBody(request, MAX_READ_BUNDLE_MANIFEST_BYTES);
    let value;
    try {
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifest));
    }
    catch {
        throw new GraftProtocolError(400, "invalid_read_bundle", "Invalid read-bundle manifest");
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new GraftProtocolError(400, "invalid_read_bundle", "Invalid read-bundle manifest");
    }
    const record = value;
    if (Object.keys(record).some((key) => key !== "version" && key !== "paths") ||
        record.version !== 1 ||
        !Array.isArray(record.paths) ||
        record.paths.length === 0 ||
        record.paths.length > MAX_READ_BUNDLE_OBJECTS) {
        throw new GraftProtocolError(400, "invalid_read_bundle", "Invalid read-bundle manifest");
    }
    const seen = new Set();
    const paths = record.paths.map((path) => {
        if (typeof path !== "string") {
            throw new GraftProtocolError(400, "invalid_read_bundle", "Invalid read-bundle path");
        }
        const validated = validateObjectPath(path);
        requireImmutablePath(validated);
        if (seen.has(validated)) {
            throw new GraftProtocolError(400, "invalid_read_bundle", "Duplicate read-bundle path");
        }
        seen.add(validated);
        return validated;
    });
    paths.sort(bytewiseCompare);
    const sizes = await resolveObjectSizes(backend, paths);
    const objects = paths.map((path) => {
        const size = sizes.get(path);
        if (size === undefined)
            throw objectNotFound();
        return { path, size };
    });
    const totalBytes = uploadBundleTotalBytes(new Uint8Array(), objects);
    if (totalBytes > MAX_READ_BUNDLE_RESPONSE_BYTES) {
        throw new GraftProtocolError(413, "read_bundle_too_large", "Read-bundle response exceeds the aggregate size limit");
    }
    return new Response(new UploadBundleBody(backend, new Uint8Array(), objects).stream, {
        headers: protocolHeaders({
            "Content-Length": totalBytes.toString(),
            "Content-Type": "application/vnd.graft.read-bundle",
            [READ_BUNDLE_HEADER_OBJECTS]: objects.length.toString(),
            [UPLOAD_BUNDLE_HEADER_TOTAL_BYTES]: totalBytes.toString(),
        }),
    });
}
async function listImmutableObjects(backend) {
    const objects = [];
    let after;
    for (;;) {
        const result = await backend.list({ prefix: "", after, limit: MAX_LIST_LIMIT });
        if (result.paths.length > MAX_LIST_LIMIT) {
            throw backendContractError("List backend returned more paths than requested");
        }
        const listedEntries = new Map();
        for (const entry of result.entries ?? []) {
            const path = validateObjectPath(entry.path);
            validateMetadata(entry);
            if (listedEntries.has(path)) {
                throw backendContractError("List backend returned duplicate object metadata");
            }
            listedEntries.set(path, entry.size);
        }
        const immutablePaths = [];
        for (const path of result.paths) {
            validateObjectPath(path);
            if (after !== undefined && bytewiseCompare(path, after) <= 0) {
                throw backendContractError("List backend returned unsorted paths");
            }
            after = path;
            if (isImmutablePath(path))
                immutablePaths.push(path);
            if (objects.length + immutablePaths.length > MAX_UPLOAD_BUNDLE_OBJECTS) {
                throw new GraftProtocolError(413, "upload_bundle_too_large", "Too many bundled objects");
            }
        }
        const missingPaths = immutablePaths.filter((path) => !listedEntries.has(path));
        const resolved = await resolveObjectSizes(backend, missingPaths);
        for (const path of immutablePaths) {
            const size = listedEntries.get(path) ?? resolved.get(path);
            if (size === undefined) {
                throw backendContractError("Bundled immutable object disappeared");
            }
            objects.push({ path, size });
        }
        if (!result.hasMore)
            return objects;
        if (result.paths.length === 0) {
            throw backendContractError("List backend cannot advance the upload-bundle cursor");
        }
    }
}
async function resolveObjectSizes(backend, paths) {
    const resolved = new Map();
    let next = 0;
    const workers = Array.from({ length: Math.min(UPLOAD_BUNDLE_PREFETCH_OBJECTS, paths.length) }, async () => {
        for (;;) {
            const index = next;
            next += 1;
            const path = paths[index];
            if (path === undefined)
                return;
            const metadata = await backend.head(path);
            if (metadata === null)
                continue;
            validateMetadata(metadata);
            resolved.set(path, metadata.size);
        }
    });
    await Promise.all(workers);
    return resolved;
}
function uploadBundleTotalBytes(manifest, objects) {
    let total = manifest.byteLength;
    const encoder = new TextEncoder();
    for (const object of objects) {
        const frameBytes = 12 + encoder.encode(object.path).byteLength + object.size;
        total += frameBytes;
        if (!Number.isSafeInteger(total)) {
            throw backendContractError("Upload bundle is too large to declare its byte length");
        }
    }
    return total;
}
async function readMetadataObject(backend, path) {
    const object = await backend.get(path);
    if (object === null)
        return null;
    validateMetadata(object);
    if (object.size > MAX_METADATA_BYTES) {
        throw backendContractError("Transactional backend object exceeds the metadata limit");
    }
    const bytes = await readObjectBody(object, MAX_METADATA_BYTES);
    if (bytes.byteLength !== object.size) {
        throw backendContractError("Backend object body does not match its declared size");
    }
    return bytes;
}
async function readObjectBody(object, limit) {
    const reader = objectBodyStream(object).getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const result = await reader.read();
            if (result.done)
                break;
            total += result.value.byteLength;
            if (total > limit)
                throw backendContractError("Backend object body exceeds its size limit");
            chunks.push(result.value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(new ArrayBuffer(total));
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
function encodeLowerHex(bytes) {
    let value = "";
    for (const byte of bytes)
        value += byte.toString(16).padStart(2, "0");
    return value;
}
function objectBodyStream(object) {
    if (object.body instanceof ReadableStream)
        return object.body;
    const bytes = object.body instanceof Uint8Array ? object.body : new Uint8Array(object.body);
    return new ReadableStream({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
}
class UploadBundleBody {
    stream;
    #backend;
    #objects;
    #pending;
    #prefetched = new Map();
    #index = 0;
    #nextPrefetch = 0;
    #reader;
    #remaining = 0;
    constructor(backend, manifest, objects) {
        this.#backend = backend;
        this.#objects = objects;
        this.#pending = [manifest];
        this.stream = new ReadableStream({
            pull: async (controller) => {
                try {
                    await this.pull(controller);
                }
                catch (error) {
                    await this.cancel(error);
                    throw error;
                }
            },
            cancel: async (reason) => await this.cancel(reason),
        });
    }
    async pull(controller) {
        for (;;) {
            const pending = this.#pending.shift();
            if (pending !== undefined) {
                controller.enqueue(pending);
                return;
            }
            if (this.#reader !== undefined) {
                if (await this.pullObject(controller))
                    return;
                continue;
            }
            if (this.#index === this.#objects.length) {
                controller.close();
                return;
            }
            await this.openObject();
        }
    }
    async openObject() {
        this.fillPrefetch();
        const expected = this.#objects[this.#index];
        const path = expected.path;
        const prefetched = await this.#prefetched.get(this.#index);
        this.#prefetched.delete(this.#index);
        if (!prefetched.ok)
            throw prefetched.error;
        const object = prefetched.object;
        if (object === null)
            throw backendContractError("Bundled immutable object disappeared");
        validateMetadata(object);
        if (object.size !== expected.size) {
            throw backendContractError("Bundled immutable object size changed after listing");
        }
        this.#remaining = object.size;
        this.#reader = objectBodyStream(object).getReader();
        this.#pending.push(uploadBundleFrameHeader(path, object.size));
    }
    fillPrefetch() {
        const end = Math.min(this.#objects.length, this.#index + UPLOAD_BUNDLE_PREFETCH_OBJECTS);
        while (this.#nextPrefetch < end) {
            const index = this.#nextPrefetch;
            const path = this.#objects[index].path;
            const object = Promise.resolve(this.#backend.get(path)).then((value) => ({ ok: true, object: value }), (error) => ({ ok: false, error }));
            this.#prefetched.set(index, object);
            this.#nextPrefetch += 1;
        }
    }
    async pullObject(controller) {
        for (;;) {
            const result = await this.#reader.read();
            if (result.done) {
                this.#reader.releaseLock();
                this.#reader = undefined;
                if (this.#remaining !== 0)
                    throw backendContractError("Bundled object body is truncated");
                this.#index += 1;
                return false;
            }
            if (result.value.byteLength === 0)
                continue;
            if (result.value.byteLength > this.#remaining) {
                throw backendContractError("Bundled object body exceeds its declared size");
            }
            this.#remaining -= result.value.byteLength;
            controller.enqueue(result.value);
            return true;
        }
    }
    async cancel(reason) {
        const reader = this.#reader;
        this.#reader = undefined;
        if (reader !== undefined) {
            try {
                await reader.cancel(reason);
            }
            finally {
                reader.releaseLock();
            }
        }
        const prefetched = [...this.#prefetched.values()];
        this.#prefetched.clear();
        this.#nextPrefetch = this.#objects.length;
        const objects = await Promise.all(prefetched);
        await Promise.all(objects.map(async (result) => {
            if (!result.ok || result.object === null)
                return;
            const body = result.object.body;
            if (!(body instanceof ReadableStream) || body.locked)
                return;
            try {
                await body.cancel(reason);
            }
            catch {
                // A backend may have already canceled the prefetched body.
            }
        }));
    }
}
function uploadBundleFrameHeader(path, size) {
    const pathBytes = new TextEncoder().encode(path);
    const header = new Uint8Array(new ArrayBuffer(12 + pathBytes.byteLength));
    const view = new DataView(header.buffer);
    view.setUint32(0, pathBytes.byteLength);
    view.setBigUint64(4, BigInt(size));
    header.set(pathBytes, 12);
    return header;
}
async function receivePack(request, backend, refPath) {
    requireTransactionalPath(refPath);
    const expected = parseExpectedHeaders(request.headers);
    const { packId, packBytes, indexBytes, replacement } = parseReceivePackHeaders(request.headers);
    const bodyBytes = checkedReceivePackBodyBytes(packBytes, indexBytes);
    requireReceiveContentLength(request.headers, bodyBytes);
    if (request.body === null) {
        throw new GraftProtocolError(400, "invalid_receive_pack_body", "Receive-pack body is missing");
    }
    const source = new ReceivePackBodySource(request.body.getReader());
    let consumed = false;
    try {
        await receivePackObject(backend, source, `objects/pack/${packId}.pack`, packBytes);
        await receivePackObject(backend, source, `objects/pack/${packId}.idx`, indexBytes);
        await source.requireEnd();
        consumed = true;
    }
    finally {
        if (consumed)
            source.release();
        else
            await source.abort();
    }
    if (!(await backend.compareAndSwap(refPath, expected, replacement))) {
        throw new GraftProtocolError(409, "compare_failed", "Object changed during compare-and-swap");
    }
    return emptyResponse();
}
async function receiveBundle(request, backend, refPath) {
    requireTransactionalPath(refPath);
    const expected = parseExpectedHeaders(request.headers);
    const { packId, packBytes, indexBytes, replacement } = parseReceivePackHeaders(request.headers);
    const manifestBytes = parseReceiveBundleManifestLength(request.headers);
    if (request.body === null) {
        throw new GraftProtocolError(400, "invalid_receive_bundle_body", "Receive-bundle body is missing");
    }
    const source = new ReceivePackBodySource(request.body.getReader());
    let consumed = false;
    try {
        const manifest = parseReceiveBundleManifest(await source.readExact(manifestBytes));
        const bodyBytes = checkedReceiveBodyBytes([
            manifestBytes,
            ...manifest.map((object) => object.bytes),
            packBytes,
            indexBytes,
        ]);
        requireReceiveContentLength(request.headers, bodyBytes);
        const objects = [
            ...manifest,
            { path: `objects/pack/${packId}.pack`, bytes: packBytes, allowExisting: true },
            { path: `objects/pack/${packId}.idx`, bytes: indexBytes, allowExisting: true },
        ];
        // Bound buffering to 256 KiB; large objects retain streaming backpressure.
        for (let index = 0; index < objects.length;) {
            const object = objects[index];
            if (object.bytes > 64 * 1024) {
                await receivePackObject(backend, source, object.path, object.bytes, object.allowExisting);
                index++;
                continue;
            }
            const batch = [];
            while (index < objects.length && batch.length < 4 && objects[index].bytes <= 64 * 1024) {
                const next = objects[index++];
                batch.push({
                    path: next.path,
                    bytes: await source.readExact(next.bytes),
                    allowExisting: next.allowExisting,
                });
            }
            const writes = await Promise.allSettled(batch.map(async (entry) => {
                const created = await backend.putIfAbsent(entry.path, entry.bytes, "immutable", {
                    contentLength: entry.bytes.byteLength,
                });
                if (!created && !entry.allowExisting) {
                    throw new GraftProtocolError(412, "precondition_failed", "Bundled object already exists and requires client verification");
                }
            }));
            // Settle every write before returning an error; never publish a partial batch.
            for (const write of writes)
                if (write.status === "rejected")
                    throw write.reason;
        }
        await source.requireEnd();
        consumed = true;
    }
    finally {
        if (consumed)
            source.release();
        else
            await source.abort();
    }
    if (!(await backend.compareAndSwap(refPath, expected, replacement))) {
        throw new GraftProtocolError(409, "compare_failed", "Object changed during compare-and-swap");
    }
    return emptyResponse();
}
async function receivePackObject(backend, source, path, contentLength, allowExisting = true) {
    const part = source.part(contentLength);
    const created = await backend.putIfAbsent(path, part.stream, "immutable", {
        contentLength,
    });
    await part.finish(created);
    if (!created && !allowExisting) {
        throw new GraftProtocolError(412, "precondition_failed", "Bundled object already exists and requires client verification");
    }
}
function checkedReceivePackBodyBytes(packBytes, indexBytes) {
    return checkedReceiveBodyBytes([packBytes, indexBytes]);
}
function checkedReceiveBodyBytes(lengths) {
    let total = 0;
    for (const length of lengths) {
        total += length;
        if (!Number.isSafeInteger(total)) {
            throw new GraftProtocolError(413, "receive_pack_too_large", "Receive body exceeds the safe limit");
        }
    }
    if (!Number.isSafeInteger(total)) {
        throw new GraftProtocolError(413, "receive_pack_too_large", "Receive body exceeds the safe limit");
    }
    return total;
}
function requireReceiveContentLength(headers, expected) {
    const value = headers.get("content-length");
    if (value === null || !/^(?:0|[1-9]\d*)$/.test(value) || Number(value) !== expected) {
        throw new GraftProtocolError(400, "invalid_receive_pack_body", "Content-Length must equal the declared receive body lengths");
    }
}
class ReceivePackBodySource {
    #reader;
    #buffer;
    #active = false;
    constructor(reader) {
        this.#reader = reader;
    }
    part(length) {
        if (this.#active) {
            throw backendContractError("Receive-pack body parts must be consumed in order");
        }
        this.#active = true;
        return new ReceivePackBodyPart(this, length);
    }
    async read(maxBytes) {
        const buffered = this.#buffer;
        if (buffered !== undefined) {
            this.#buffer = undefined;
            return this.split(buffered, maxBytes);
        }
        const result = await this.#reader.read();
        return result.done ? null : this.split(result.value, maxBytes);
    }
    async readExact(length) {
        if (this.#active) {
            throw backendContractError("Receive-pack body part was not released");
        }
        const bytes = new Uint8Array(new ArrayBuffer(length));
        let offset = 0;
        while (offset < length) {
            const chunk = await this.read(length - offset);
            if (chunk === null) {
                throw new GraftProtocolError(400, "invalid_receive_bundle_body", "Receive-bundle body is truncated");
            }
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return bytes;
    }
    finishPart() {
        this.#active = false;
    }
    async requireEnd() {
        if (this.#active) {
            throw backendContractError("Receive-pack body part was not released");
        }
        if ((await this.read(1)) !== null) {
            throw new GraftProtocolError(400, "invalid_receive_pack_body", "Receive-pack body contains trailing bytes");
        }
    }
    release() {
        this.#reader.releaseLock();
    }
    async abort() {
        try {
            await this.#reader.cancel("receive-pack aborted");
        }
        catch {
            // Preserve the protocol or backend failure that aborted publication.
        }
        this.#reader.releaseLock();
    }
    split(bytes, maxBytes) {
        if (bytes.byteLength <= maxBytes)
            return bytes;
        this.#buffer = bytes.subarray(maxBytes);
        return bytes.subarray(0, maxBytes);
    }
}
class ReceivePackBodyPart {
    stream;
    #source;
    #remaining;
    constructor(source, length) {
        this.#source = source;
        this.#remaining = length;
        this.stream = new ReadableStream({
            pull: async (controller) => await this.pull(controller),
            cancel: () => undefined,
        }, { highWaterMark: 0 });
    }
    async finish(created) {
        if (this.#remaining !== 0 && this.stream.locked) {
            throw backendContractError("Immutable backend retained the receive-pack body reader");
        }
        if (created && this.#remaining !== 0) {
            throw backendContractError("Immutable backend did not consume the created object body");
        }
        while (this.#remaining !== 0) {
            const bytes = await this.#source.read(this.#remaining);
            if (bytes === null)
                this.truncated();
            this.#remaining -= bytes.byteLength;
        }
        this.#source.finishPart();
    }
    async pull(controller) {
        if (this.#remaining === 0) {
            controller.close();
            return;
        }
        const bytes = await this.#source.read(this.#remaining);
        if (bytes === null) {
            controller.error(new GraftProtocolError(400, "invalid_receive_pack_body", "Receive-pack body is truncated"));
            return;
        }
        this.#remaining -= bytes.byteLength;
        controller.enqueue(bytes);
        if (this.#remaining === 0)
            controller.close();
    }
    truncated() {
        throw new GraftProtocolError(400, "invalid_receive_pack_body", "Receive-pack body is truncated");
    }
}
async function compareAndSwap(request, backend, path) {
    requireTransactionalPath(path);
    const expected = parseExpectedHeaders(request.headers);
    const replacement = await readLimitedBody(request, MAX_METADATA_BYTES);
    if (!(await backend.compareAndSwap(path, expected, replacement))) {
        throw new GraftProtocolError(409, "compare_failed", "Object changed during compare-and-swap");
    }
    return emptyResponse();
}
async function compareAndDelete(request, backend, path) {
    requireTransactionalPath(path);
    const expected = parseExpectedHeaders(request.headers);
    if (!(await backend.compareAndDelete(path, expected))) {
        throw new GraftProtocolError(409, "compare_failed", "Object changed during compare-and-delete");
    }
    return emptyResponse();
}
async function listObjects(backend, url) {
    const query = validateListQuery(url);
    const result = await backend.list(query);
    if (result.paths.length > query.limit) {
        throw backendContractError("List backend returned more paths than requested");
    }
    let previous = query.after;
    for (const path of result.paths) {
        validateObjectPath(path);
        if (!path.startsWith(query.prefix) ||
            (previous !== undefined && bytewiseCompare(path, previous) <= 0)) {
            throw backendContractError("List backend returned unsorted or out-of-prefix paths");
        }
        previous = path;
    }
    if (result.hasMore) {
        const last = result.paths.at(-1);
        if (last === undefined) {
            throw backendContractError("List backend cannot advance the cursor");
        }
        return jsonResponse({
            paths: result.paths,
            next_cursor: encodeListCursor(query.prefix, last),
        });
    }
    return jsonResponse({ paths: result.paths });
}
function normalizeRemoteLimits(limits) {
    const maxRequestBytes = limits?.maxRequestBytes;
    const multipartPartBytes = limits?.multipartPartBytes ?? DEFAULT_MULTIPART_PART_BYTES;
    if (maxRequestBytes !== undefined &&
        (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1)) {
        throw new TypeError("maxRequestBytes must be a positive safe integer");
    }
    if (!Number.isSafeInteger(multipartPartBytes) || multipartPartBytes < 1) {
        throw new TypeError("multipartPartBytes must be a positive safe integer");
    }
    if (maxRequestBytes !== undefined && multipartPartBytes > maxRequestBytes) {
        throw new TypeError("multipartPartBytes cannot exceed maxRequestBytes");
    }
    return {
        ...(maxRequestBytes === undefined ? {} : { maxRequestBytes }),
        multipartPartBytes,
    };
}
function enforceRequestLimit(headers, maxRequestBytes) {
    if (maxRequestBytes === undefined)
        return;
    const value = headers.get("content-length");
    if (value === null)
        return;
    if (!/^(?:0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new GraftProtocolError(400, "invalid_content_length", "Content-Length must be a non-negative safe integer");
    }
    if (Number(value) > maxRequestBytes) {
        throw new GraftProtocolError(413, "request_too_large", "Request exceeds the remote service request limit");
    }
}
function requireMultipartBackend(backend) {
    if (backend.multipart === undefined ||
        (backend.encryption !== undefined && backend.multipart.supportsEncryption !== true)) {
        throw new GraftProtocolError(404, "operation_not_found", "Multipart object upload is not supported");
    }
    return backend.multipart;
}
function requireImmutablePath(path) {
    if (!isImmutablePath(path)) {
        throw new GraftProtocolError(400, "invalid_immutable_path", "Multipart upload is only defined for immutable objects");
    }
}
function requireEmptyBody(request) {
    const value = request.headers.get("content-length");
    if (value !== null && value !== "0") {
        throw new GraftProtocolError(400, "unexpected_body", "Request body must be empty");
    }
}
function parsePositiveIntegerHeader(headers, name) {
    const value = headers.get(name);
    if (value === null || !/^[1-9]\d*$/.test(value)) {
        throw new GraftProtocolError(400, "invalid_multipart_upload", `${name} must be positive`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new GraftProtocolError(413, "multipart_object_too_large", `${name} is too large`);
    }
    return parsed;
}
function parseContentLengthHeader(headers) {
    const value = headers.get("content-length");
    if (value === null || !/^(?:0|[1-9]\d*)$/.test(value)) {
        throw new GraftProtocolError(400, "invalid_multipart_part", "Multipart part requires Content-Length");
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new GraftProtocolError(413, "multipart_part_too_large", "Multipart part is too large");
    }
    return parsed;
}
function parseUploadId(headers) {
    const value = headers.get(MULTIPART_HEADER_UPLOAD_ID);
    if (value === null ||
        value.length < 1 ||
        value.length > 1_024 ||
        /[\u0000-\u001f\u007f]/.test(value)) {
        throw new GraftProtocolError(400, "invalid_multipart_upload", `${MULTIPART_HEADER_UPLOAD_ID} is invalid`);
    }
    return value;
}
function validateMultipartUpload(upload, totalBytes, partBytes) {
    if (upload.uploadId.length < 1 ||
        upload.uploadId.length > 1_024 ||
        /[\u0000-\u001f\u007f]/.test(upload.uploadId) ||
        upload.totalBytes !== totalBytes ||
        upload.partBytes !== partBytes) {
        throw backendContractError("Multipart backend returned an invalid upload session");
    }
    const partCount = Math.ceil(totalBytes / partBytes);
    let previous = 0;
    for (const part of upload.uploadedParts) {
        if (!Number.isSafeInteger(part.partNumber) ||
            part.partNumber <= previous ||
            part.partNumber > partCount) {
            throw backendContractError("Multipart backend returned invalid uploaded parts");
        }
        const expectedBytes = part.partNumber === partCount ? totalBytes - partBytes * (partCount - 1) : partBytes;
        if (part.bytes !== expectedBytes) {
            throw backendContractError("Multipart backend returned an invalid uploaded part size");
        }
        previous = part.partNumber;
    }
}
function objectHeaders(metadata) {
    const headers = new Headers({
        "Accept-Ranges": "bytes",
        "Content-Length": metadata.size.toString(),
        "Content-Type": metadata.contentType ?? "application/octet-stream",
    });
    if (metadata.etag !== undefined) {
        headers.set("ETag", metadata.etag);
    }
    return headers;
}
function validateMetadata(metadata) {
    if (!Number.isSafeInteger(metadata.size) || metadata.size < 0) {
        throw backendContractError("Backend returned an invalid object size");
    }
}
function asBodyInit(object) {
    if (object.body instanceof Uint8Array) {
        if (object.body.byteOffset === 0 && object.body.byteLength === object.body.buffer.byteLength) {
            return object.body.buffer;
        }
        return object.body.slice().buffer;
    }
    return object.body;
}
function requireTransactionalPath(path) {
    if (!isTransactionalPath(path)) {
        throw new GraftProtocolError(400, "invalid_transactional_path", "CAS is only defined for HEAD and refs/**");
    }
}
function requireMethod(actual, expected) {
    if (actual !== expected) {
        throw methodNotAllowed(expected);
    }
}
function methodNotAllowed(allow) {
    return new GraftProtocolError(405, "method_not_allowed", "Method not allowed", { Allow: allow });
}
function objectNotFound() {
    return new GraftProtocolError(404, "object_not_found", "Object not found");
}
function backendContractError(message) {
    return new GraftProtocolError(500, "backend_contract_error", message);
}
//# sourceMappingURL=handler.js.map