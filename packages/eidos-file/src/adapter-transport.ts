import { canonicalizeEidosFileJson } from "./canonical-json"
import type {
  AdapterError,
  AdapterErrorCode,
  HostLimits,
} from "./adapter-contract"
import type {
  CommitReconciliation,
  CsvExportResult,
  CsvImportRequest,
  RuntimeCapabilities,
  RuntimeClient,
  RuntimeError,
  TransportCommitBarrier,
} from "./runtime-contract"
import type {
  JsonObject,
  JsonValue,
  OwnedBytes,
  RequestContext,
} from "./protocol-types"

export interface AdapterTransportLimits {
  maxOutstandingRequests: number
  maxQueuedBytes: number
  maxRequestBytes: number
  maxResponseBytes: number
  defaultTimeoutMs: number
  maxTimeoutMs: number
  commitAckTimeoutMs: number
}

export const EIDOS_ADAPTER_TRANSPORT_LIMITS: Readonly<AdapterTransportLimits> =
  Object.freeze({
    maxOutstandingRequests: 32,
    maxQueuedBytes: 16 * 1024 * 1024,
    maxRequestBytes: 8 * 1024 * 1024,
    maxResponseBytes: 16 * 1024 * 1024,
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 300_000,
    commitAckTimeoutMs: 5_000,
  })

export interface AdapterAttachmentDescriptor {
  id: string
  slot: string
  byteLength: number
}

interface AdapterWireBase {
  protocol: "eidos-adapter"
}

interface AdapterWireSessionBase extends AdapterWireBase {
  version: "1.0"
  epoch: string
  sessionID: string
}

export type AdapterWireEnvelope =
  | (AdapterWireBase & {
      kind: "hello"
      versions: string[]
    })
  | (AdapterWireBase & {
      kind: "hello-error"
      error: AdapterError
    })
  | (AdapterWireSessionBase & {
      kind: "hello-result"
      limits: AdapterTransportLimits
      cancelMode: "interrupt" | "terminate"
    })
  | (AdapterWireSessionBase & {
      kind: "request"
      requestID: string
      sequence: number
      timeoutMs?: number
      operation: string
      payload: JsonValue
      attachments?: AdapterAttachmentDescriptor[]
    })
  | (AdapterWireSessionBase & {
      kind: "response"
      requestID: string
      sequence: number
      ok: true
      result: JsonValue
      attachments?: AdapterAttachmentDescriptor[]
    })
  | (AdapterWireSessionBase & {
      kind: "response"
      requestID: string
      sequence: number
      ok: false
      error:
        | { source: "runtime"; error: RuntimeError }
        | { source: "adapter"; error: AdapterError }
    })
  | (AdapterWireSessionBase & {
      kind: "commit-prepared"
      requestID: string
      sequence: number
      receipt: AdapterCommitReceipt
    })
  | (AdapterWireSessionBase & {
      kind: "commit-ack"
      requestID: string
      sequence: number
      receiptID: string
      requestDigest: string
    })
  | (AdapterWireSessionBase & {
      kind: "cancel"
      requestID: string
    })
  | (AdapterWireSessionBase & {
      kind: "close"
      requestID: string
      timeoutMs?: number
    })
  | (AdapterWireSessionBase & {
      kind: "close-result"
      requestID: string
    })

export interface AdapterStructuredCloneCarrier {
  envelope: AdapterWireEnvelope
  buffers: ArrayBuffer[]
}

export interface AdapterCommitReceipt {
  protocol: "eidos-commit-receipt"
  version: "1.0"
  receiptID: string
  epoch: string
  sessionID: string
  workingID: string
  requestID: string
  sequence: number
  operation: string
  fileID: string
  baseRevision: string
  commitRevision: string
  requestDigest: string
  reconciliation: CommitReconciliation
}

export interface AdapterTransportChannel {
  post(carrier: AdapterStructuredCloneCarrier, transfers?: Transferable[]): void
  subscribe(
    listener: (carrier: AdapterStructuredCloneCarrier) => void,
    onClose?: (reason?: unknown) => void
  ): () => void
  close?(): void
}

const RUNTIME_OPERATIONS = new Set([
  "negotiate",
  "getSnapshot",
  "getSchemaPage",
  "queryRows",
  "getRowsById",
  "aggregate",
  "groupRows",
  "queryGroupRows",
  "previewFormula",
  "mutateRows",
  "revertMutation",
  "mutateView",
  "preflightSchema",
  "getSchemaPlanDependencies",
  "mutateSchema",
  "validate",
  "exportCsv",
  "importCsv",
])

const PREPARED_OPERATIONS = new Set([
  "mutateRows",
  "revertMutation",
  "mutateView",
  "mutateSchema",
  "importCsv",
])

export function validateAdapterCarrier(
  carrier: unknown
): asserts carrier is AdapterStructuredCloneCarrier {
  if (
    !isRecord(carrier) ||
    !("envelope" in carrier) ||
    !("buffers" in carrier)
  ) {
    throw adapterFailure(
      "protocol-error",
      "Carrier must contain envelope and buffers",
      true
    )
  }
  if (
    !Array.isArray(carrier.buffers) ||
    !carrier.buffers.every((item) => item instanceof ArrayBuffer)
  ) {
    throw adapterFailure(
      "protocol-error",
      "Carrier buffers must be ArrayBuffer values",
      true
    )
  }
  const buffers = carrier.buffers as ArrayBuffer[]
  validateAdapterEnvelope(carrier.envelope)
  const descriptors =
    "attachments" in carrier.envelope
      ? (carrier.envelope.attachments ?? [])
      : []
  if (descriptors.length !== carrier.buffers.length) {
    throw adapterFailure(
      "protocol-error",
      "Attachment descriptor count mismatch",
      true
    )
  }
  const ids = new Set<string>()
  const slots = new Set<string>()
  descriptors.forEach((descriptor, index) => {
    if (
      !isRecord(descriptor) ||
      !opaque(descriptor.id) ||
      !/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(String(descriptor.slot)) ||
      !safeNonNegativeInteger(descriptor.byteLength) ||
      ids.has(String(descriptor.id)) ||
      slots.has(String(descriptor.slot)) ||
      buffers[index]!.byteLength !== descriptor.byteLength
    ) {
      throw adapterFailure(
        "protocol-error",
        "Invalid attachment descriptor",
        true
      )
    }
    ids.add(String(descriptor.id))
    slots.add(String(descriptor.slot))
  })
}

export function validateAdapterEnvelope(
  envelope: unknown
): asserts envelope is AdapterWireEnvelope {
  if (
    !isRecord(envelope) ||
    envelope.protocol !== "eidos-adapter" ||
    typeof envelope.kind !== "string"
  ) {
    throw adapterFailure("protocol-error", "Invalid Adapter envelope", true)
  }
  assertJsonValue(envelope)
  if (envelope.kind === "hello") {
    exactKeys(envelope, ["kind", "protocol", "versions"])
    if (
      !Array.isArray(envelope.versions) ||
      envelope.versions.length < 1 ||
      !envelope.versions.every((item) => typeof item === "string")
    ) {
      throw adapterFailure("protocol-error", "Invalid Adapter hello", true)
    }
    return
  }
  if (envelope.kind === "hello-error") {
    exactKeys(envelope, ["kind", "protocol", "error"])
    validateAdapterError(envelope.error)
    return
  }
  if (
    envelope.version !== "1.0" ||
    !opaque(envelope.epoch) ||
    !opaque(envelope.sessionID)
  ) {
    throw adapterFailure(
      "protocol-error",
      "Invalid Adapter session binding",
      true
    )
  }
  switch (envelope.kind) {
    case "hello-result":
      exactKeys(envelope, [
        "kind",
        "protocol",
        "version",
        "epoch",
        "sessionID",
        "limits",
        "cancelMode",
      ])
      validateTransportLimits(envelope.limits)
      if (
        envelope.cancelMode !== "interrupt" &&
        envelope.cancelMode !== "terminate"
      ) {
        throw adapterFailure("protocol-error", "Invalid cancel mode", true)
      }
      return
    case "request":
      exactKeys(
        envelope,
        [
          "kind",
          "protocol",
          "version",
          "epoch",
          "sessionID",
          "requestID",
          "sequence",
          "timeoutMs",
          "operation",
          "payload",
          "attachments",
        ],
        true
      )
      requestCorrelation(envelope)
      if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(String(envelope.operation))) {
        throw adapterFailure(
          "protocol-error",
          "Invalid Runtime operation",
          true
        )
      }
      validateAttachments(envelope.attachments)
      return
    case "response":
      requestCorrelation(envelope)
      if (typeof envelope.ok !== "boolean")
        throw adapterFailure("protocol-error", "Invalid response status", true)
      if (envelope.ok) validateAttachments(envelope.attachments)
      else validateWireError(envelope.error)
      return
    case "commit-prepared":
      requestCorrelation(envelope)
      validateCommitReceipt(envelope.receipt)
      return
    case "commit-ack":
      requestCorrelation(envelope)
      if (!opaque(envelope.receiptID) || !sha256(envelope.requestDigest)) {
        throw adapterFailure(
          "protocol-error",
          "Invalid commit acknowledgement",
          true
        )
      }
      return
    case "cancel":
      requestId(envelope.requestID)
      return
    case "close":
      requestId(envelope.requestID)
      if (envelope.timeoutMs !== undefined)
        positiveSafeInteger(envelope.timeoutMs, "timeoutMs")
      return
    case "close-result":
      requestId(envelope.requestID)
      return
    default:
      throw adapterFailure(
        "protocol-error",
        "Unknown Adapter envelope kind",
        true
      )
  }
}

export interface AdapterTransportServerOptions {
  epoch: string
  sessionID: string
  workingID: string
  limits?: AdapterTransportLimits
  cancelMode: "interrupt" | "terminate"
  allocateReceiptID(): string
  retainPreparedReceipt?(receipt: AdapterCommitReceipt): void
  settlePreparedReceipt?(
    receipt: AdapterCommitReceipt,
    committed: boolean
  ): void
  closeConnection(): void
}

interface ActiveWireRequest {
  envelope: Extract<AdapterWireEnvelope, { kind: "request" }>
  buffers: ArrayBuffer[]
  requestDigest: string
}

interface PendingAck {
  receipt: AdapterCommitReceipt
  resolve: () => void
  reject: (error: AdapterError) => void
  timer: ReturnType<typeof setTimeout>
  accepted: boolean
}

export class AdapterTransportServer {
  readonly commitBarrier: TransportCommitBarrier
  private runtime: RuntimeClient | null = null
  private readonly limits: AdapterTransportLimits
  private sequence = 0
  private queue: Promise<void> = Promise.resolve()
  private active: ActiveWireRequest | null = null
  private pendingAck: PendingAck | null = null
  private helloComplete = false
  private closing = false
  private closed = false
  private queuedBytes = 0
  private outstandingRequests = 0

  constructor(
    private readonly send: (
      carrier: AdapterStructuredCloneCarrier,
      transfers?: Transferable[]
    ) => void,
    private readonly options: AdapterTransportServerOptions
  ) {
    opaqueOrThrow(options.epoch, "epoch")
    opaqueOrThrow(options.sessionID, "sessionID")
    opaqueOrThrow(options.workingID, "workingID")
    this.limits = { ...(options.limits ?? EIDOS_ADAPTER_TRANSPORT_LIMITS) }
    validateTransportLimits(this.limits)
    this.commitBarrier = {
      prepare: (preparation, context) =>
        this.prepareCommit(preparation, context),
    }
  }

  attachRuntime(runtime: RuntimeClient): void {
    if (this.runtime) throw new Error("Runtime is already attached")
    this.runtime = runtime
  }

  receive(carrier: unknown): void {
    try {
      validateAdapterCarrier(carrier)
      const envelope = carrier.envelope
      if (envelope.kind === "hello") {
        this.receiveHello(envelope)
        return
      }
      if (
        "epoch" in envelope &&
        (envelope.epoch !== this.options.epoch ||
          envelope.sessionID !== this.options.sessionID)
      ) {
        return
      }
      if (!this.helloComplete || this.closed) return
      if (envelope.kind === "cancel") {
        void this.runtime?.cancel({ requestId: envelope.requestID })
        if (
          this.pendingAck?.receipt.requestID === envelope.requestID &&
          !this.pendingAck.accepted
        ) {
          this.pendingAck.reject(
            adapterFailure("cancelled", "Request was cancelled", false, true)
          )
        }
        return
      }
      if (envelope.kind === "commit-ack") {
        this.receiveCommitAck(envelope)
        return
      }
      if (envelope.kind === "close") {
        this.receiveClose(envelope)
        return
      }
      if (envelope.kind !== "request") {
        this.fatal("Unexpected client envelope")
        return
      }
      this.receiveRequest(envelope, carrier.buffers)
    } catch (error) {
      const failure = adapterError(error)
      if (failure.fatal) this.fatal(failure.message)
    }
  }

  private receiveHello(
    envelope: Extract<AdapterWireEnvelope, { kind: "hello" }>
  ): void {
    if (
      this.helloComplete ||
      this.closed ||
      !envelope.versions.includes("1.0")
    ) {
      this.post({
        kind: "hello-error",
        protocol: "eidos-adapter",
        error: adapterFailure(
          "unsupported-capability",
          "Eidos Adapter 1.0 is required",
          false
        ),
      })
      return
    }
    this.helloComplete = true
    this.post({
      kind: "hello-result",
      protocol: "eidos-adapter",
      version: "1.0",
      epoch: this.options.epoch,
      sessionID: this.options.sessionID,
      limits: { ...this.limits },
      cancelMode: this.options.cancelMode,
    })
  }

  private receiveRequest(
    envelope: Extract<AdapterWireEnvelope, { kind: "request" }>,
    buffers: ArrayBuffer[]
  ): void {
    if (this.closing || !this.runtime) {
      this.failure(
        envelope,
        adapterFailure("transport-closed", "Transport is closing", false)
      )
      return
    }
    if (envelope.sequence !== this.sequence + 1) {
      this.fatal("Request sequence is not contiguous")
      return
    }
    if (!RUNTIME_OPERATIONS.has(envelope.operation)) {
      this.failure(
        envelope,
        adapterFailure("protocol-error", "Unknown Runtime operation", false)
      )
      return
    }
    const size = carrierBytes({ envelope, buffers })
    if (size > this.limits.maxRequestBytes) {
      this.failure(
        envelope,
        adapterFailure(
          "resource-limit",
          "Request exceeds maxRequestBytes",
          false
        )
      )
      return
    }
    if (this.queuedBytes + size > this.limits.maxQueuedBytes) {
      this.failure(
        envelope,
        adapterFailure("backpressure", "Transport queue is full", false, true)
      )
      return
    }
    if (this.outstandingRequests >= this.limits.maxOutstandingRequests) {
      this.failure(
        envelope,
        adapterFailure(
          "backpressure",
          "Too many outstanding requests",
          false,
          true
        )
      )
      return
    }
    this.sequence = envelope.sequence
    this.queuedBytes += size
    this.outstandingRequests += 1
    const task = async () => {
      this.queuedBytes -= size
      try {
        await this.executeRequest(envelope, buffers)
      } finally {
        this.outstandingRequests -= 1
      }
    }
    this.queue = this.queue.then(task, task)
  }

  private async executeRequest(
    envelope: Extract<AdapterWireEnvelope, { kind: "request" }>,
    buffers: ArrayBuffer[]
  ): Promise<void> {
    if (!this.runtime || this.closed) return
    try {
      const payload = requestPayload(envelope, buffers)
      const requestDigest = await digestRequest(
        envelope,
        buffers,
        this.options.workingID
      )
      this.active = { envelope, buffers, requestDigest }
      const method = this.runtime[
        envelope.operation as keyof RuntimeClient
      ] as unknown as (
        payload: unknown,
        context: RequestContext
      ) => Promise<unknown>
      if (typeof method !== "function") {
        throw runtimeFailure("unsupported", "Runtime operation is unavailable")
      }
      const timeoutMs = Math.min(
        envelope.timeoutMs ?? this.limits.defaultTimeoutMs,
        this.limits.maxTimeoutMs
      )
      const result = await method.call(this.runtime, payload, {
        requestId: envelope.requestID,
        deadlineMilliseconds: timeoutMs,
      })
      const response = responsePayload(envelope.operation, result)
      const responseEnvelope: Extract<
        AdapterWireEnvelope,
        { kind: "response"; ok: true }
      > = {
        kind: "response",
        protocol: "eidos-adapter",
        version: "1.0",
        epoch: this.options.epoch,
        sessionID: this.options.sessionID,
        requestID: envelope.requestID,
        sequence: envelope.sequence,
        ok: true,
        result: response.result,
        ...(response.attachments.length > 0
          ? {
              attachments: response.attachments.map(
                (entry) => entry.descriptor
              ),
            }
          : {}),
      }
      const responseCarrier = {
        envelope: responseEnvelope,
        buffers: response.attachments.map((entry) => entry.buffer),
      }
      if (carrierBytes(responseCarrier) > this.limits.maxResponseBytes) {
        throw runtimeFailure(
          "resource-limit",
          "Response exceeds maxResponseBytes"
        )
      }
      this.send(responseCarrier, responseCarrier.buffers)
      if (this.pendingAck?.accepted) {
        this.options.settlePreparedReceipt?.(this.pendingAck.receipt, true)
      }
    } catch (error) {
      const runtime = runtimeErrorFromUnknown(error)
      this.post({
        kind: "response",
        protocol: "eidos-adapter",
        version: "1.0",
        epoch: this.options.epoch,
        sessionID: this.options.sessionID,
        requestID: envelope.requestID,
        sequence: envelope.sequence,
        ok: false,
        error: { source: "runtime", error: runtime },
      })
      if (this.pendingAck && !this.pendingAck.accepted) {
        this.options.settlePreparedReceipt?.(this.pendingAck.receipt, false)
      }
    } finally {
      this.active = null
      if (this.pendingAck) clearTimeout(this.pendingAck.timer)
      this.pendingAck = null
    }
  }

  private async prepareCommit(
    preparation: Parameters<TransportCommitBarrier["prepare"]>[0],
    _context: RequestContext
  ): Promise<void> {
    const active = this.active
    if (
      !active ||
      !PREPARED_OPERATIONS.has(active.envelope.operation) ||
      this.pendingAck
    ) {
      throw adapterFailure(
        "protocol-error",
        "Commit barrier is outside a prepared mutation",
        true
      )
    }
    const receipt: AdapterCommitReceipt = {
      protocol: "eidos-commit-receipt",
      version: "1.0",
      receiptID: this.options.allocateReceiptID(),
      epoch: this.options.epoch,
      sessionID: this.options.sessionID,
      workingID: this.options.workingID,
      requestID: active.envelope.requestID,
      sequence: active.envelope.sequence,
      operation: active.envelope.operation,
      fileID: preparation.fileID,
      baseRevision: preparation.baseRevision,
      commitRevision: preparation.commitRevision,
      requestDigest: active.requestDigest,
      reconciliation: preparation.reconciliation,
    }
    validateCommitReceipt(receipt)
    validateReceiptSemantics(receipt, active.envelope.operation)
    const prepared: Extract<AdapterWireEnvelope, { kind: "commit-prepared" }> =
      {
        kind: "commit-prepared",
        protocol: "eidos-adapter",
        version: "1.0",
        epoch: this.options.epoch,
        sessionID: this.options.sessionID,
        requestID: active.envelope.requestID,
        sequence: active.envelope.sequence,
        receipt,
      }
    if (
      carrierBytes({ envelope: prepared, buffers: [] }) >
      this.limits.maxResponseBytes
    ) {
      throw adapterFailure(
        "resource-limit",
        "Prepared receipt exceeds maxResponseBytes",
        false
      )
    }
    this.options.retainPreparedReceipt?.(receipt)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          adapterFailure(
            "deadline-exceeded",
            "Commit acknowledgement timed out",
            false,
            true
          )
        )
      }, this.limits.commitAckTimeoutMs)
      this.pendingAck = { receipt, resolve, reject, timer, accepted: false }
      this.post(prepared)
    })
  }

  private receiveCommitAck(
    envelope: Extract<AdapterWireEnvelope, { kind: "commit-ack" }>
  ): void {
    const pending = this.pendingAck
    if (!pending) {
      this.fatal("Commit acknowledgement has no preparation")
      return
    }
    const receipt = pending.receipt
    if (
      envelope.requestID !== receipt.requestID ||
      envelope.sequence !== receipt.sequence ||
      envelope.receiptID !== receipt.receiptID ||
      envelope.requestDigest !== receipt.requestDigest
    ) {
      pending.reject(
        adapterFailure(
          "protocol-error",
          "Commit acknowledgement mismatch",
          true
        )
      )
      return
    }
    if (pending.accepted) return
    pending.accepted = true
    clearTimeout(pending.timer)
    pending.resolve()
  }

  private receiveClose(
    envelope: Extract<AdapterWireEnvelope, { kind: "close" }>
  ): void {
    if (this.closing) return
    this.closing = true
    const task = async () => {
      try {
        await this.runtime?.close({
          requestId: envelope.requestID,
          ...(envelope.timeoutMs === undefined
            ? {}
            : { deadlineMilliseconds: envelope.timeoutMs }),
        })
      } finally {
        this.options.closeConnection()
        this.closed = true
        this.post({
          kind: "close-result",
          protocol: "eidos-adapter",
          version: "1.0",
          epoch: this.options.epoch,
          sessionID: this.options.sessionID,
          requestID: envelope.requestID,
        })
      }
    }
    this.queue = this.queue.then(task, task)
  }

  private failure(
    request: Extract<AdapterWireEnvelope, { kind: "request" }>,
    error: AdapterError
  ): void {
    this.post({
      kind: "response",
      protocol: "eidos-adapter",
      version: "1.0",
      epoch: this.options.epoch,
      sessionID: this.options.sessionID,
      requestID: request.requestID,
      sequence: request.sequence,
      ok: false,
      error: { source: "adapter", error },
    })
  }

  private fatal(message: string): void {
    this.closed = true
    this.closing = true
    this.pendingAck?.reject(adapterFailure("transport-fatal", message, true))
    try {
      this.options.closeConnection()
    } catch {
      // The channel is already fatal; closure remains best effort.
    }
  }

  private post(envelope: AdapterWireEnvelope): void {
    this.send({ envelope, buffers: [] })
  }
}

interface PendingClientRequest {
  operation: string
  applicationRequestID: string
  sequence: number
  bytes: number
  resolve: (value: unknown) => void
  reject: (error: RuntimeError) => void
  unsubscribe: () => void
  timer: ReturnType<typeof setTimeout>
  receipt?: AdapterCommitReceipt
  requestDigest: Promise<string>
  ackAttempted: boolean
}

export interface AdapterTransportRuntimeClientOptions {
  /** Host-private working identity used only to validate commit receipts. */
  workingID: string
  retainPreparedReceipt(receipt: AdapterCommitReceipt): void
  settlePreparedReceipt(receipt: AdapterCommitReceipt): void
}

export class AdapterTransportRuntimeClient implements RuntimeClient {
  declare revertMutation: RuntimeClient["revertMutation"]
  declare exportCsv: RuntimeClient["exportCsv"]
  declare importCsv: RuntimeClient["importCsv"]
  private limits: AdapterTransportLimits | null = null
  private epoch = ""
  private sessionID = ""
  private sequence = 0
  private wireID = 0
  private queuedBytes = 0
  private readonly pending = new Map<string, PendingClientRequest>()
  private readonly applicationToWire = new Map<string, string>()
  private readonly unsubscribe: () => void
  private helloResolve: ((value: void) => void) | null = null
  private helloReject: ((error: RuntimeError) => void) | null = null
  private state: "opening" | "open" | "fatal" | "closed" = "opening"

  constructor(
    private readonly channel: AdapterTransportChannel,
    private readonly options: AdapterTransportRuntimeClientOptions
  ) {
    opaqueOrThrow(options.workingID, "workingID")
    this.unsubscribe = channel.subscribe(
      (carrier) => void this.receive(carrier),
      () => this.channelClosed()
    )
  }

  async connect(): Promise<this> {
    if (this.state !== "opening") return this
    const ready = new Promise<void>((resolve, reject) => {
      this.helloResolve = resolve
      this.helloReject = reject
    })
    this.channel.post({
      envelope: {
        kind: "hello",
        protocol: "eidos-adapter",
        versions: ["1.0"],
      },
      buffers: [],
    })
    await ready
    return this
  }

  async negotiate(
    request: Parameters<RuntimeClient["negotiate"]>[0],
    context: RequestContext
  ): ReturnType<RuntimeClient["negotiate"]> {
    const result = (await this.call("negotiate", request, context)) as Awaited<
      ReturnType<RuntimeClient["negotiate"]>
    >
    this.installOptionalMethods(result.capabilities)
    return result
  }
  getSnapshot(
    request: Parameters<RuntimeClient["getSnapshot"]>[0],
    context: RequestContext
  ) {
    return this.call("getSnapshot", request, context) as ReturnType<
      RuntimeClient["getSnapshot"]
    >
  }
  getSchemaPage(
    request: Parameters<RuntimeClient["getSchemaPage"]>[0],
    context: RequestContext
  ) {
    return this.call("getSchemaPage", request, context) as ReturnType<
      RuntimeClient["getSchemaPage"]
    >
  }
  queryRows(
    request: Parameters<RuntimeClient["queryRows"]>[0],
    context: RequestContext
  ) {
    return this.call("queryRows", request, context) as ReturnType<
      RuntimeClient["queryRows"]
    >
  }
  getRowsById(
    request: Parameters<RuntimeClient["getRowsById"]>[0],
    context: RequestContext
  ) {
    return this.call("getRowsById", request, context) as ReturnType<
      RuntimeClient["getRowsById"]
    >
  }
  aggregate(
    request: Parameters<RuntimeClient["aggregate"]>[0],
    context: RequestContext
  ) {
    return this.call("aggregate", request, context) as ReturnType<
      RuntimeClient["aggregate"]
    >
  }
  groupRows(
    request: Parameters<RuntimeClient["groupRows"]>[0],
    context: RequestContext
  ) {
    return this.call("groupRows", request, context) as ReturnType<
      RuntimeClient["groupRows"]
    >
  }
  queryGroupRows(
    request: Parameters<RuntimeClient["queryGroupRows"]>[0],
    context: RequestContext
  ) {
    return this.call("queryGroupRows", request, context) as ReturnType<
      RuntimeClient["queryGroupRows"]
    >
  }
  previewFormula(
    request: Parameters<RuntimeClient["previewFormula"]>[0],
    context: RequestContext
  ) {
    return this.call("previewFormula", request, context) as ReturnType<
      RuntimeClient["previewFormula"]
    >
  }
  mutateRows(
    request: Parameters<RuntimeClient["mutateRows"]>[0],
    context: RequestContext
  ) {
    return this.call("mutateRows", request, context) as ReturnType<
      RuntimeClient["mutateRows"]
    >
  }
  mutateView(
    request: Parameters<RuntimeClient["mutateView"]>[0],
    context: RequestContext
  ) {
    return this.call("mutateView", request, context) as ReturnType<
      RuntimeClient["mutateView"]
    >
  }
  preflightSchema(
    request: Parameters<RuntimeClient["preflightSchema"]>[0],
    context: RequestContext
  ) {
    return this.call("preflightSchema", request, context) as ReturnType<
      RuntimeClient["preflightSchema"]
    >
  }
  getSchemaPlanDependencies(
    request: Parameters<RuntimeClient["getSchemaPlanDependencies"]>[0],
    context: RequestContext
  ) {
    return this.call(
      "getSchemaPlanDependencies",
      request,
      context
    ) as ReturnType<RuntimeClient["getSchemaPlanDependencies"]>
  }
  mutateSchema(
    request: Parameters<RuntimeClient["mutateSchema"]>[0],
    context: RequestContext
  ) {
    return this.call("mutateSchema", request, context) as ReturnType<
      RuntimeClient["mutateSchema"]
    >
  }
  validate(
    request: Parameters<RuntimeClient["validate"]>[0],
    context: RequestContext
  ) {
    return this.call("validate", request, context) as ReturnType<
      RuntimeClient["validate"]
    >
  }

  async cancel(request: { requestId: string }): Promise<void> {
    const wireID = this.applicationToWire.get(request.requestId)
    if (!wireID || !this.limits || this.state !== "open") return
    const pending = this.pending.get(wireID)
    if (!pending || pending.ackAttempted) return
    this.channel.post({
      envelope: {
        kind: "cancel",
        protocol: "eidos-adapter",
        version: "1.0",
        epoch: this.epoch,
        sessionID: this.sessionID,
        requestID: wireID,
      },
      buffers: [],
    })
  }

  async close(context: RequestContext): Promise<void> {
    if (this.state === "closed") return
    assertRequestContext(context)
    if (!this.limits || this.state === "opening") {
      this.finishClose()
      return
    }
    const wireID = this.nextWireID()
    await new Promise<void>((resolve, reject) => {
      const timeout = Math.min(
        context.deadlineMilliseconds ?? this.limits!.defaultTimeoutMs,
        this.limits!.maxTimeoutMs
      )
      const timer = setTimeout(
        () =>
          reject(
            runtimeFailure(
              "deadline-exceeded",
              "Transport close timed out",
              true
            )
          ),
        timeout
      )
      const listener = (carrier: AdapterStructuredCloneCarrier) => {
        if (
          carrier.envelope.kind === "close-result" &&
          carrier.envelope.requestID === wireID
        ) {
          clearTimeout(timer)
          remove()
          resolve()
        }
      }
      const remove = this.channel.subscribe(listener)
      this.channel.post({
        envelope: {
          kind: "close",
          protocol: "eidos-adapter",
          version: "1.0",
          epoch: this.epoch,
          sessionID: this.sessionID,
          requestID: wireID,
          timeoutMs: timeout,
        },
        buffers: [],
      })
    }).finally(() => this.finishClose())
  }

  private call(
    operation: string,
    logicalRequest: unknown,
    context: RequestContext
  ): Promise<unknown> {
    try {
      assertRequestContext(context)
      if (!this.limits || this.state !== "open") {
        throw runtimeFailure(
          this.state === "fatal" ? "fatal" : "closed",
          "Transport is not open"
        )
      }
      if (this.applicationToWire.has(context.requestId)) {
        throw runtimeFailure(
          "invalid-request",
          "requestId is already unresolved"
        )
      }
      if (this.pending.size >= this.limits.maxOutstandingRequests) {
        throw runtimeFailure(
          "resource-limit",
          "Transport request limit reached",
          true
        )
      }
      const attachment =
        operation === "importCsv"
          ? extractCsvRequest(logicalRequest as CsvImportRequest)
          : {
              payload: logicalRequest as JsonValue,
              attachments: [] as Array<{
                descriptor: AdapterAttachmentDescriptor
                buffer: ArrayBuffer
              }>,
            }
      const wireID = this.nextWireID()
      const sequence = ++this.sequence
      const timeoutMs = Math.min(
        context.deadlineMilliseconds ?? this.limits.defaultTimeoutMs,
        this.limits.maxTimeoutMs
      )
      const envelope: Extract<AdapterWireEnvelope, { kind: "request" }> = {
        kind: "request",
        protocol: "eidos-adapter",
        version: "1.0",
        epoch: this.epoch,
        sessionID: this.sessionID,
        requestID: wireID,
        sequence,
        timeoutMs,
        operation,
        payload: attachment.payload,
        ...(attachment.attachments.length > 0
          ? {
              attachments: attachment.attachments.map(
                (entry) => entry.descriptor
              ),
            }
          : {}),
      }
      const carrier = {
        envelope,
        buffers: attachment.attachments.map((entry) => entry.buffer),
      }
      const bytes = carrierBytes(carrier)
      if (
        bytes > this.limits.maxRequestBytes ||
        this.queuedBytes + bytes > this.limits.maxQueuedBytes
      ) {
        throw runtimeFailure(
          "resource-limit",
          "Transport request exceeds negotiated limits"
        )
      }
      return new Promise((resolve, reject) => {
        const requestDigest = digestRequest(
          envelope,
          carrier.buffers,
          this.options.workingID
        )
        const timer = setTimeout(() => {
          const pending = this.pending.get(wireID)
          if (!pending) return
          if (pending.ackAttempted) {
            this.fatalPending(
              runtimeFailure(
                "unknown-commit",
                "Commit outcome requires reconciliation",
                false,
                { reconciliationRequired: true }
              )
            )
          } else {
            void this.cancel({ requestId: context.requestId })
          }
        }, timeoutMs)
        const unsubscribe =
          context.signal?.onAbort(() => {
            void this.cancel({ requestId: context.requestId })
          }) ?? (() => undefined)
        this.pending.set(wireID, {
          operation,
          applicationRequestID: context.requestId,
          sequence,
          bytes,
          resolve,
          reject,
          unsubscribe,
          timer,
          requestDigest,
          ackAttempted: false,
        })
        this.applicationToWire.set(context.requestId, wireID)
        this.queuedBytes += bytes
        this.channel.post(carrier, carrier.buffers)
      })
    } catch (error) {
      return Promise.reject(runtimeErrorFromUnknown(error))
    }
  }

  private installOptionalMethods(capabilities: RuntimeCapabilities): void {
    if (capabilities.mutationUndo) {
      this.revertMutation = (request, context) =>
        this.call("revertMutation", request, context) as ReturnType<
          NonNullable<RuntimeClient["revertMutation"]>
        >
    } else {
      delete this.revertMutation
    }
    if (capabilities.csvExport) {
      this.exportCsv = (request, context) =>
        this.call("exportCsv", request, context) as ReturnType<
          NonNullable<RuntimeClient["exportCsv"]>
        >
    } else {
      delete this.exportCsv
    }
    if (capabilities.csvImport) {
      this.importCsv = (request, context) =>
        this.call("importCsv", request, context) as ReturnType<
          NonNullable<RuntimeClient["importCsv"]>
        >
    } else {
      delete this.importCsv
    }
  }

  private async receive(carrier: AdapterStructuredCloneCarrier): Promise<void> {
    try {
      validateAdapterCarrier(carrier)
      const envelope = carrier.envelope
      if (envelope.kind === "hello-result" && this.state === "opening") {
        this.epoch = envelope.epoch
        this.sessionID = envelope.sessionID
        this.limits = { ...envelope.limits }
        this.state = "open"
        this.helloResolve?.()
        this.helloResolve = null
        this.helloReject = null
        return
      }
      if (envelope.kind === "hello-error" && this.state === "opening") {
        const error = mapAdapterError(envelope.error)
        this.helloReject?.(error)
        this.state = "fatal"
        return
      }
      if (
        !("epoch" in envelope) ||
        envelope.epoch !== this.epoch ||
        envelope.sessionID !== this.sessionID
      )
        return
      if (envelope.kind === "commit-prepared") {
        await this.receivePrepared(envelope)
        return
      }
      if (envelope.kind !== "response") return
      const pending = this.pending.get(envelope.requestID)
      if (!pending || pending.sequence !== envelope.sequence) return
      if (envelope.ok) {
        const result = resultPayload(
          pending.operation,
          envelope.result,
          carrier.buffers
        )
        this.settle(envelope.requestID, () => pending.resolve(result))
      } else {
        const error =
          envelope.error.source === "runtime"
            ? envelope.error.error
            : mapAdapterError(envelope.error.error)
        this.settle(envelope.requestID, () => pending.reject(error))
      }
    } catch (error) {
      this.fatalPending(runtimeErrorFromUnknown(error))
    }
  }

  private async receivePrepared(
    envelope: Extract<AdapterWireEnvelope, { kind: "commit-prepared" }>
  ): Promise<void> {
    const pending = this.pending.get(envelope.requestID)
    if (
      !pending ||
      pending.sequence !== envelope.sequence ||
      pending.ackAttempted
    ) {
      throw runtimeFailure("fatal", "Unexpected commit preparation")
    }
    validateReceiptSemantics(envelope.receipt, pending.operation)
    if (
      envelope.receipt.epoch !== this.epoch ||
      envelope.receipt.sessionID !== this.sessionID ||
      envelope.receipt.workingID !== this.options.workingID ||
      envelope.receipt.requestDigest !== (await pending.requestDigest)
    ) {
      throw runtimeFailure("fatal", "Commit receipt session mismatch")
    }
    pending.receipt = envelope.receipt
    this.options.retainPreparedReceipt(envelope.receipt)
    pending.ackAttempted = true
    this.channel.post({
      envelope: {
        kind: "commit-ack",
        protocol: "eidos-adapter",
        version: "1.0",
        epoch: this.epoch,
        sessionID: this.sessionID,
        requestID: envelope.requestID,
        sequence: envelope.sequence,
        receiptID: envelope.receipt.receiptID,
        requestDigest: envelope.receipt.requestDigest,
      },
      buffers: [],
    })
  }

  private settle(wireID: string, settle: () => void): void {
    const pending = this.pending.get(wireID)
    if (!pending) return
    clearTimeout(pending.timer)
    pending.unsubscribe()
    this.pending.delete(wireID)
    this.applicationToWire.delete(pending.applicationRequestID)
    this.queuedBytes -= pending.bytes
    if (pending.receipt) this.options.settlePreparedReceipt(pending.receipt)
    settle()
  }

  private channelClosed(): void {
    const unknown = Array.from(this.pending.values()).some(
      (item) => item.ackAttempted
    )
    this.fatalPending(
      unknown
        ? runtimeFailure(
            "unknown-commit",
            "Commit outcome requires reconciliation",
            false,
            { reconciliationRequired: true }
          )
        : runtimeFailure("fatal", "Transport channel closed")
    )
  }

  private fatalPending(error: RuntimeError): void {
    this.state = "fatal"
    for (const [wireID, pending] of this.pending) {
      this.settle(wireID, () =>
        pending.reject(
          pending.ackAttempted
            ? runtimeFailure(
                "unknown-commit",
                "Commit outcome requires reconciliation",
                false,
                { reconciliationRequired: true }
              )
            : error
        )
      )
    }
  }

  private finishClose(): void {
    if (this.state === "closed") return
    this.state = "closed"
    this.unsubscribe()
    this.channel.close?.()
  }

  private nextWireID(): string {
    this.wireID += 1
    return `request-${this.wireID}`
  }
}

function requestPayload(
  envelope: Extract<AdapterWireEnvelope, { kind: "request" }>,
  buffers: ArrayBuffer[]
): unknown {
  const attachments = envelope.attachments ?? []
  if (envelope.operation === "importCsv") {
    if (attachments.length !== 1 || attachments[0]!.slot !== "csv") {
      throw adapterFailure(
        "protocol-error",
        "importCsv requires exactly one csv attachment",
        true
      )
    }
    if (!isRecord(envelope.payload) || "csv" in envelope.payload) {
      throw adapterFailure(
        "protocol-error",
        "importCsv payload must omit csv",
        true
      )
    }
    return { ...envelope.payload, csv: new Uint8Array(buffers[0]!.slice(0)) }
  }
  if (attachments.length !== 0) {
    throw adapterFailure(
      "protocol-error",
      "Runtime operation does not accept attachments",
      true
    )
  }
  return envelope.payload
}

function responsePayload(
  operation: string,
  result: unknown
): {
  result: JsonValue
  attachments: Array<{
    descriptor: AdapterAttachmentDescriptor
    buffer: ArrayBuffer
  }>
} {
  if (operation === "exportCsv") {
    if (!isRecord(result) || !(result.csv instanceof Uint8Array)) {
      throw adapterFailure(
        "protocol-error",
        "exportCsv result is missing owned csv bytes",
        true
      )
    }
    const buffer = ownedArrayBuffer(result.csv)
    const { csv: _csv, ...payload } = result
    return {
      result: payload as JsonValue,
      attachments: [
        {
          descriptor: { id: "csv", slot: "csv", byteLength: buffer.byteLength },
          buffer,
        },
      ],
    }
  }
  assertJsonValue(result)
  return { result, attachments: [] }
}

function resultPayload(
  operation: string,
  result: JsonValue,
  buffers: ArrayBuffer[]
): unknown {
  if (operation !== "exportCsv") {
    if (buffers.length !== 0)
      throw adapterFailure(
        "protocol-error",
        "Unexpected response attachment",
        true
      )
    return result
  }
  if (!isRecord(result) || buffers.length !== 1) {
    throw adapterFailure(
      "protocol-error",
      "Invalid exportCsv response attachments",
      true
    )
  }
  return {
    ...result,
    csv: new Uint8Array(buffers[0]!.slice(0)),
  } as unknown as CsvExportResult
}

function extractCsvRequest(request: CsvImportRequest): {
  payload: JsonValue
  attachments: Array<{
    descriptor: AdapterAttachmentDescriptor
    buffer: ArrayBuffer
  }>
} {
  const buffer = ownedArrayBuffer(request.csv)
  const { csv: _csv, ...payload } = request
  return {
    payload: payload as JsonValue,
    attachments: [
      {
        descriptor: { id: "csv", slot: "csv", byteLength: buffer.byteLength },
        buffer,
      },
    ],
  }
}

async function digestRequest(
  envelope: Extract<AdapterWireEnvelope, { kind: "request" }>,
  buffers: ArrayBuffer[],
  workingID: string
): Promise<string> {
  const attachments = await Promise.all(
    (envelope.attachments ?? []).map(async (descriptor, index) => ({
      ...descriptor,
      sha256: await sha256Bytes(new Uint8Array(buffers[index]!)),
    }))
  )
  return sha256Bytes(
    new TextEncoder().encode(
      canonicalizeEidosFileJson({
        protocol: "eidos-adapter",
        version: "1.0",
        epoch: envelope.epoch,
        sessionID: envelope.sessionID,
        workingID,
        requestID: envelope.requestID,
        sequence: envelope.sequence,
        timeoutMs: envelope.timeoutMs ?? null,
        operation: envelope.operation,
        payload: envelope.payload,
        attachments,
      })
    )
  )
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("")
}

function validateReceiptSemantics(
  receipt: AdapterCommitReceipt,
  operation: string
): void {
  if (
    receipt.operation !== operation ||
    receipt.reconciliation.operation !== operation ||
    receipt.fileID !== receipt.reconciliation.result.fileId ||
    receipt.commitRevision !== receipt.reconciliation.result.revision ||
    BigInt(receipt.commitRevision) !== BigInt(receipt.baseRevision) + 1n
  ) {
    throw adapterFailure(
      "protocol-error",
      "Commit receipt semantic mismatch",
      true
    )
  }
}

function validateCommitReceipt(
  receipt: unknown
): asserts receipt is AdapterCommitReceipt {
  if (
    !isRecord(receipt) ||
    receipt.protocol !== "eidos-commit-receipt" ||
    receipt.version !== "1.0" ||
    !opaque(receipt.receiptID) ||
    !opaque(receipt.epoch) ||
    !opaque(receipt.sessionID) ||
    !opaque(receipt.workingID) ||
    !requestIdValue(receipt.requestID) ||
    !positiveSafeIntegerValue(receipt.sequence) ||
    typeof receipt.operation !== "string" ||
    typeof receipt.fileID !== "string" ||
    !nonNegativeInt64(receipt.baseRevision) ||
    !nonNegativeInt64(receipt.commitRevision) ||
    !sha256(receipt.requestDigest) ||
    !isRecord(receipt.reconciliation)
  ) {
    throw adapterFailure("protocol-error", "Invalid commit receipt", true)
  }
}

function carrierBytes(carrier: AdapterStructuredCloneCarrier): number {
  return (
    new TextEncoder().encode(
      canonicalizeEidosFileJson(carrier.envelope as unknown as JsonValue)
    ).byteLength +
    carrier.buffers.reduce((total, buffer) => total + buffer.byteLength, 0)
  )
}

function validateTransportLimits(
  value: unknown
): asserts value is AdapterTransportLimits {
  if (!isRecord(value))
    throw adapterFailure("protocol-error", "Invalid Transport limits", true)
  for (const key of [
    "maxOutstandingRequests",
    "maxQueuedBytes",
    "maxRequestBytes",
    "maxResponseBytes",
    "defaultTimeoutMs",
    "maxTimeoutMs",
    "commitAckTimeoutMs",
  ])
    positiveSafeInteger(value[key], key)
  if (
    Number(value.maxOutstandingRequests) > 65_536 ||
    Number(value.maxQueuedBytes) < 1_048_576 ||
    Number(value.maxRequestBytes) < 65_536 ||
    Number(value.maxResponseBytes) < 65_536 ||
    Number(value.defaultTimeoutMs) < 30_000 ||
    Number(value.maxTimeoutMs) < Number(value.defaultTimeoutMs) ||
    Number(value.commitAckTimeoutMs) < 100 ||
    Number(value.commitAckTimeoutMs) > 60_000
  )
    throw adapterFailure(
      "protocol-error",
      "Transport limits are outside Adapter 1.0 bounds",
      true
    )
}

function validateAttachments(value: unknown): void {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length > 1_024) {
    throw adapterFailure("protocol-error", "Invalid attachment list", true)
  }
}

function validateWireError(value: unknown): void {
  if (
    !isRecord(value) ||
    (value.source !== "adapter" && value.source !== "runtime")
  ) {
    throw adapterFailure("protocol-error", "Invalid wire error", true)
  }
  if (value.source === "adapter") validateAdapterError(value.error)
  else validateRuntimeError(value.error)
}

function validateAdapterError(value: unknown): asserts value is AdapterError {
  if (
    !isRecord(value) ||
    typeof value.code !== "string" ||
    typeof value.message !== "string" ||
    typeof value.retryable !== "boolean" ||
    typeof value.fatal !== "boolean"
  ) {
    throw adapterFailure("protocol-error", "Invalid Adapter error", true)
  }
}

function validateRuntimeError(value: unknown): asserts value is RuntimeError {
  if (
    !isRecord(value) ||
    typeof value.code !== "string" ||
    typeof value.message !== "string" ||
    typeof value.retryable !== "boolean"
  ) {
    throw adapterFailure("protocol-error", "Invalid Runtime error", true)
  }
}

function requestCorrelation(value: Record<string, unknown>): void {
  requestId(value.requestID)
  positiveSafeInteger(value.sequence, "sequence")
  if (value.timeoutMs !== undefined)
    positiveSafeInteger(value.timeoutMs, "timeoutMs")
}

function requestId(value: unknown): void {
  if (!requestIdValue(value))
    throw adapterFailure("protocol-error", "Invalid request ID", true)
}

function requestIdValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\u0000") &&
    new TextEncoder().encode(value).byteLength <= 128 &&
    !hasUnpairedSurrogate(value)
  )
}

function opaque(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    !hasUnpairedSurrogate(value)
  )
}

function opaqueOrThrow(value: string, label: string): void {
  if (!opaque(value))
    throw new RangeError(`${label} must be an Adapter opaque token`)
}

function nonNegativeInt64(value: unknown): value is string {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value))
    return false
  try {
    return BigInt(value) <= 9_223_372_036_854_775_807n
  } catch {
    return false
  }
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

function positiveSafeInteger(value: unknown, label: string): void {
  if (!positiveSafeIntegerValue(value))
    throw adapterFailure(
      "protocol-error",
      `${label} must be a positive safe integer`,
      true
    )
}

function positiveSafeIntegerValue(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: string[],
  optional = false
): void {
  const accepted = new Set(allowed)
  if (Object.keys(value).some((key) => !accepted.has(key))) {
    throw adapterFailure("protocol-error", "Envelope has unknown members", true)
  }
  if (!optional && allowed.some((key) => !(key in value))) {
    throw adapterFailure(
      "protocol-error",
      "Envelope is missing required members",
      true
    )
  }
}

function assertJsonValue(
  value: unknown,
  seen = new Set<object>()
): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    if (typeof value === "string" && hasUnpairedSurrogate(value))
      throw adapterFailure(
        "protocol-error",
        "JSON string contains an unpaired surrogate",
        true
      )
    return
  }
  if (typeof value === "number" && Number.isFinite(value)) return
  if (typeof value !== "object" || value === null || seen.has(value)) {
    throw adapterFailure(
      "protocol-error",
      "Envelope contains a non-JSON value",
      true
    )
  }
  seen.add(value)
  if (Array.isArray(value))
    value.forEach((entry) => assertJsonValue(entry, seen))
  else {
    for (const [key, entry] of Object.entries(value)) {
      if (hasUnpairedSurrogate(key))
        throw adapterFailure(
          "protocol-error",
          "JSON key contains an unpaired surrogate",
          true
        )
      assertJsonValue(entry, seen)
    }
  }
  seen.delete(value)
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) return true
  }
  return false
}

function adapterFailure(
  code: AdapterErrorCode,
  message: string,
  fatal: boolean,
  retryable = false
): AdapterError {
  return { code, message, retryable, fatal }
}

function adapterError(value: unknown): AdapterError {
  if (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.fatal === "boolean"
  ) {
    return value as unknown as AdapterError
  }
  return adapterFailure(
    "transport-fatal",
    value instanceof Error ? value.message : "Adapter Transport failed",
    true
  )
}

function runtimeFailure(
  code: RuntimeError["code"],
  message: string,
  retryable = false,
  details?: JsonObject
): RuntimeError {
  return { code, message, retryable, ...(details ? { details } : {}) }
}

function runtimeErrorFromUnknown(value: unknown): RuntimeError {
  if (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean" &&
    !("fatal" in value)
  ) {
    return value as unknown as RuntimeError
  }
  if (isRecord(value) && typeof value.code === "string" && "fatal" in value) {
    return mapAdapterError(value as unknown as AdapterError)
  }
  return runtimeFailure(
    "fatal",
    value instanceof Error ? value.message : "Runtime operation failed"
  )
}

function mapAdapterError(error: AdapterError): RuntimeError {
  if (error.code === "commit-outcome-unknown") {
    return runtimeFailure("unknown-commit", error.message, false, {
      reconciliationRequired: true,
    })
  }
  const code: RuntimeError["code"] = error.fatal
    ? "fatal"
    : error.code === "busy"
      ? "busy"
      : error.code === "cancelled"
        ? "cancelled"
        : error.code === "deadline-exceeded"
          ? "deadline-exceeded"
          : error.code === "resource-limit" || error.code === "backpressure"
            ? "resource-limit"
            : error.code === "corrupt" || error.code === "not-a-database"
              ? "corrupt-file"
              : error.code === "adapter-closed" ||
                  error.code === "transport-closed"
                ? "closed"
                : "adapter-error"
  return runtimeFailure(code, error.message, error.retryable, {
    adapterCode: error.code,
    fatal: error.fatal,
  })
}

function assertRequestContext(context: RequestContext): void {
  requestId(context.requestId)
  if (context.deadlineMilliseconds !== undefined)
    positiveSafeInteger(context.deadlineMilliseconds, "deadlineMilliseconds")
  if (context.signal?.aborted)
    throw runtimeFailure("cancelled", "Request was cancelled", true)
}

function ownedArrayBuffer(bytes: OwnedBytes): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer
}

/** Host byte limits are decimal strings and must never be compared as Number. */
export function transportFitsHostLimit(
  bytes: number,
  limit: HostLimits["candidateBytesMax"]
): boolean {
  return (
    Number.isSafeInteger(bytes) && bytes >= 0 && BigInt(bytes) <= BigInt(limit)
  )
}
