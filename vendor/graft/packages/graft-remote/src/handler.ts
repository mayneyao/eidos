import {
  GRAFT_REMOTE_CAPABILITIES,
  MAX_METADATA_BYTES,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  GraftProtocolError,
  bytewiseCompare,
  emptyResponse,
  encodeListCursor,
  errorResponse,
  isImmutablePath,
  isTransactionalPath,
  jsonResponse,
  parseExpectedHeaders,
  parseRangeHeader,
  protocolHeaders,
  readLimitedBody,
  rejectUnexpectedQuery,
  validateEncodedPath,
  validateListQuery,
  validateObjectPath,
  validateRepositorySegment,
} from "./protocol.js";
import type {
  GraftObject,
  GraftObjectMetadata,
  GraftHandlerRequest,
  GraftRemoteAction,
  GraftRemoteHandler,
  GraftRemoteOperation,
  GraftRemoteOptions,
  GraftRepository,
  GraftRepositoryBackend,
  GraftRequestContext,
  GraftWriteBody,
} from "./types.js";

const OPERATIONS = new Set<GraftRemoteOperation>([
  "raw",
  "raw-if-not-exists",
  "cas",
  "cad",
  "list",
]);

export function createGraftRemoteHandler<AdapterContext = undefined, Principal = undefined>(
  options: GraftRemoteOptions<AdapterContext, Principal>,
): GraftRemoteHandler<AdapterContext> {
  return async (request): Promise<Response> => {
    try {
      return await handleRequest(request, options);
    } catch (error) {
      if (options.onError !== undefined) {
        try {
          await options.onError(error, request);
        } catch {
          console.error(
            JSON.stringify({
              message: "graft remote error reporter failed",
            }),
          );
        }
      }
      if (!(error instanceof GraftProtocolError)) {
        console.error(JSON.stringify({ message: "unhandled graft remote error" }));
      }
      return errorResponse(error);
    }
  };
}

async function handleRequest<AdapterContext, Principal>(
  input: GraftHandlerRequest<AdapterContext>,
  options: GraftRemoteOptions<AdapterContext, Principal>,
): Promise<Response> {
  const principal = await options.authenticate?.(input);
  if (input.request.headers.get(PROTOCOL_HEADER) !== PROTOCOL_VERSION) {
    throw new GraftProtocolError(
      426,
      "unsupported_protocol",
      `This service requires ${PROTOCOL_HEADER}: ${PROTOCOL_VERSION}`,
    );
  }

  const url = new URL(input.request.url);
  validateEncodedPath(url);
  const parameters = input.route;
  const namespace = validateRepositorySegment(parameters.namespace ?? "");
  const name = validateRepositorySegment(parameters.repository ?? "");
  const repositoryWithoutId = { namespace, name };
  const id =
    options.repositoryId === undefined
      ? `${namespace}/${name}`
      : await options.repositoryId(repositoryWithoutId, input);
  if (id.length === 0 || /[\u0000-\u001f\u007f]/.test(id)) {
    throw new GraftProtocolError(
      500,
      "invalid_repository_id",
      "Backend returned an invalid repository id",
    );
  }
  const repository: GraftRepository = { ...repositoryWithoutId, id };
  const operation = parseOperation(parameters.operation);
  const objectPath = parseObjectPath(operation, parameters.objectPath);
  const action = validateMethodAndAction(input.request.method, operation);
  const requestContext: GraftRequestContext<AdapterContext, Principal> = {
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

  if (operation === "descriptor") {
    rejectUnexpectedQuery(url);
    return jsonResponse({
      protocol: "graft-remote",
      version: 1,
      repository: repository.id,
      capabilities: [...GRAFT_REMOTE_CAPABILITIES],
    });
  }
  if (operation === "list") {
    return listObjects(backend, url);
  }

  rejectUnexpectedQuery(url);
  const path = objectPath!;
  switch (operation) {
    case "raw":
      return raw(input.request, backend, path);
    case "raw-if-not-exists":
      return putIfAbsent(input.request, backend, path);
    case "cas":
      return compareAndSwap(input.request, backend, path);
    case "cad":
      return compareAndDelete(input.request, backend, path);
  }
}

function parseOperation(value: string | undefined): GraftRemoteOperation {
  if (value === undefined) {
    return "descriptor";
  }
  if (!OPERATIONS.has(value as GraftRemoteOperation)) {
    throw new GraftProtocolError(404, "operation_not_found", "Unknown remote protocol operation");
  }
  return value as GraftRemoteOperation;
}

function parseObjectPath(
  operation: GraftRemoteOperation,
  value: string | undefined,
): string | undefined {
  if (operation === "descriptor" || operation === "list") {
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

function validateMethodAndAction(
  method: string,
  operation: GraftRemoteOperation,
): GraftRemoteAction {
  switch (operation) {
    case "descriptor":
      requireMethod(method, "GET");
      return "discover";
    case "list":
      requireMethod(method, "GET");
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
    case "cas":
    case "cad":
      requireMethod(method, "POST");
      return "write";
  }
}

async function raw(
  request: Request,
  backend: GraftRepositoryBackend,
  path: string,
): Promise<Response> {
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

async function headObject(backend: GraftRepositoryBackend, path: string): Promise<Response> {
  const metadata = await backend.head(path);
  if (metadata === null) {
    throw objectNotFound();
  }
  validateMetadata(metadata);
  return emptyResponse(200, objectHeaders(metadata));
}

async function getObject(
  request: Request,
  backend: GraftRepositoryBackend,
  path: string,
): Promise<Response> {
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
  const range = parseRangeHeader(rangeHeader, metadata.size)!;
  const object = await backend.get(path, range);
  if (object === null) {
    throw objectNotFound();
  }
  const headers = protocolHeaders(objectHeaders(metadata));
  headers.set("Content-Length", (range.end - range.start + 1).toString());
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${metadata.size}`);
  return new Response(asBodyInit(object), { status: 206, headers });
}

async function putIfAbsent(
  request: Request,
  backend: GraftRepositoryBackend,
  path: string,
): Promise<Response> {
  const transactional = isTransactionalPath(path);
  const body: GraftWriteBody = transactional
    ? await readLimitedBody(request, MAX_METADATA_BYTES)
    : (request.body ?? new Uint8Array(new ArrayBuffer(0)));
  const created = await backend.putIfAbsent(
    path,
    body,
    transactional ? "transactional" : "immutable",
  );
  if (!created) {
    throw new GraftProtocolError(412, "precondition_failed", "Object already exists");
  }
  return emptyResponse();
}

async function compareAndSwap(
  request: Request,
  backend: GraftRepositoryBackend,
  path: string,
): Promise<Response> {
  requireTransactionalPath(path);
  const expected = parseExpectedHeaders(request.headers);
  const replacement = await readLimitedBody(request, MAX_METADATA_BYTES);
  if (!(await backend.compareAndSwap(path, expected, replacement))) {
    throw new GraftProtocolError(409, "compare_failed", "Object changed during compare-and-swap");
  }
  return emptyResponse();
}

async function compareAndDelete(
  request: Request,
  backend: GraftRepositoryBackend,
  path: string,
): Promise<Response> {
  requireTransactionalPath(path);
  const expected = parseExpectedHeaders(request.headers);
  if (!(await backend.compareAndDelete(path, expected))) {
    throw new GraftProtocolError(409, "compare_failed", "Object changed during compare-and-delete");
  }
  return emptyResponse();
}

async function listObjects(backend: GraftRepositoryBackend, url: URL): Promise<Response> {
  const query = validateListQuery(url);
  const result = await backend.list(query);
  if (result.paths.length > query.limit) {
    throw backendContractError("List backend returned more paths than requested");
  }
  let previous = query.after;
  for (const path of result.paths) {
    validateObjectPath(path);
    if (
      !path.startsWith(query.prefix) ||
      (previous !== undefined && bytewiseCompare(path, previous) <= 0)
    ) {
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

function objectHeaders(metadata: GraftObjectMetadata): Headers {
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

function validateMetadata(metadata: GraftObjectMetadata): void {
  if (!Number.isSafeInteger(metadata.size) || metadata.size < 0) {
    throw backendContractError("Backend returned an invalid object size");
  }
}

function asBodyInit(object: GraftObject): BodyInit {
  if (object.body instanceof Uint8Array) {
    if (object.body.byteOffset === 0 && object.body.byteLength === object.body.buffer.byteLength) {
      return object.body.buffer;
    }
    return object.body.slice().buffer;
  }
  return object.body;
}

function requireTransactionalPath(path: string): void {
  if (!isTransactionalPath(path)) {
    throw new GraftProtocolError(
      400,
      "invalid_transactional_path",
      "CAS is only defined for HEAD and refs/**",
    );
  }
}

function requireMethod(actual: string, expected: string): void {
  if (actual !== expected) {
    throw methodNotAllowed(expected);
  }
}

function methodNotAllowed(allow: string): GraftProtocolError {
  return new GraftProtocolError(405, "method_not_allowed", "Method not allowed", { Allow: allow });
}

function objectNotFound(): GraftProtocolError {
  return new GraftProtocolError(404, "object_not_found", "Object not found");
}

function backendContractError(message: string): GraftProtocolError {
  return new GraftProtocolError(500, "backend_contract_error", message);
}
