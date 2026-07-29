import {
  GraftProtocolError,
  type GraftByteRange,
  type GraftListQuery,
  type GraftListResult,
  type GraftObject,
  type GraftObjectMetadata,
  type GraftRepositoryBackend,
  type GraftWriteBody,
} from "@eidos.space/graft-remote"

import type { SyncUsageDurableObject, SyncUsageSummary } from "./usage"

export type SyncQuotaMode = "off" | "shadow" | "enforce"

const R2_MULTIPART_PART_BYTES = 5 * 1024 * 1024

interface StagedR2Body {
  body: ReadableStream<Uint8Array>
  bodyCompleted: Promise<void>
  key: string
  size: number
}

export class QuotaTrackedRepositoryBackend implements GraftRepositoryBackend {
  readonly #delegate: GraftRepositoryBackend
  readonly #mode: SyncQuotaMode
  readonly #objects: R2Bucket
  readonly #pathContentLength: number | null
  readonly #quotaBytes: number
  readonly #repositoryId: string
  readonly #usage: DurableObjectStub<SyncUsageDurableObject>

  constructor(input: {
    delegate: GraftRepositoryBackend
    mode: SyncQuotaMode
    objects: R2Bucket
    pathContentLength: number | null
    quotaBytes: number
    repositoryId: string
    usage: DurableObjectStub<SyncUsageDurableObject>
  }) {
    this.#delegate = input.delegate
    this.#mode = input.mode
    this.#objects = input.objects
    this.#pathContentLength = input.pathContentLength
    this.#quotaBytes = input.quotaBytes
    this.#repositoryId = input.repositoryId
    this.#usage = input.usage
  }

  head(
    path: string
  ): Promise<GraftObjectMetadata | null> | GraftObjectMetadata | null {
    return this.#delegate.head(path)
  }

  get(
    path: string,
    range?: GraftByteRange
  ): Promise<GraftObject | null> | GraftObject | null {
    return this.#delegate.get(path, range)
  }

  put(path: string, value: Uint8Array<ArrayBuffer>): Promise<void> | void {
    return this.#delegate.put(path, value)
  }

  delete(path: string): Promise<void> | void {
    return this.#delegate.delete(path)
  }

  async putIfAbsent(
    path: string,
    value: GraftWriteBody,
    kind: "transactional" | "immutable"
  ): Promise<boolean> {
    if (kind === "transactional") {
      return await this.#delegate.putIfAbsent(path, value, kind)
    }

    if (this.#mode === "off") {
      if (value instanceof Uint8Array || this.#pathContentLength !== null) {
        return await this.#delegate.putIfAbsent(path, value, kind)
      }
      const staged = await this.stageUnknownLength(value)
      let finished = false
      try {
        const created = await this.#delegate.putIfAbsent(
          path,
          staged.body,
          kind
        )
        await this.finishStagedBody(staged, created)
        finished = true
        return created
      } finally {
        if (!finished) await this.abandonStagedBody(staged)
        await this.cleanupStaged(staged)
      }
    }

    let knownBytes =
      value instanceof Uint8Array ? value.byteLength : this.#pathContentLength
    let staged: StagedR2Body | null = null
    let stagedFinished = false
    let storageValue = value
    if (!(value instanceof Uint8Array) && knownBytes === null) {
      staged = await this.stageUnknownLength(value)
      knownBytes = staged.size
      storageValue = staged.body
    }
    if (knownBytes === null) {
      throw new Error("Immutable upload length could not be determined")
    }

    try {
      const reservationId = crypto.randomUUID()
      const reservation = await this.#usage.reserve({
        reservationId,
        repositoryId: this.#repositoryId,
        path,
        bytes: knownBytes,
        quotaBytes: this.#quotaBytes,
        enforce: this.#mode === "enforce",
      })
      if (!reservation.ok) {
        throw quotaExceeded(reservation.summary)
      }
      if (reservation.wouldExceed) {
        console.warn(
          JSON.stringify({
            message: "sync quota shadow limit exceeded",
            repositoryId: this.#repositoryId,
            usedBytes: reservation.summary.usedBytes,
            reservedBytes: reservation.summary.reservedBytes,
            quotaBytes: reservation.summary.quotaBytes,
            uploadBytes: knownBytes,
          })
        )
      }

      let persisted = false
      try {
        const created = await this.#delegate.putIfAbsent(
          path,
          storageValue,
          kind
        )
        persisted = true
        if (staged !== null) {
          await this.finishStagedBody(staged, created)
          stagedFinished = true
        }
        const metadata = await this.#delegate.head(path)
        if (metadata === null) {
          throw new Error("Immutable object is missing after storage operation")
        }
        if (created && reservation.reservationId !== null) {
          await this.#usage.commit({
            reservationId: reservation.reservationId,
            actualBytes: metadata.size,
            quotaBytes: this.#quotaBytes,
          })
        } else {
          await this.#usage.observeExisting({
            repositoryId: this.#repositoryId,
            path,
            actualBytes: metadata.size,
            quotaBytes: this.#quotaBytes,
          })
        }
        return created
      } catch (error) {
        if (reservation.reservationId !== null && !persisted) {
          try {
            await this.#usage.release(
              reservation.reservationId,
              this.#quotaBytes
            )
          } catch (releaseError) {
            console.error(
              JSON.stringify({
                message: "sync quota reservation release failed",
                error:
                  releaseError instanceof Error
                    ? releaseError.message
                    : String(releaseError),
              })
            )
          }
        }
        throw error
      }
    } finally {
      if (staged !== null) {
        if (!stagedFinished) await this.abandonStagedBody(staged)
        await this.cleanupStaged(staged)
      }
    }
  }

  compareAndSwap(
    path: string,
    expected: Uint8Array<ArrayBuffer> | undefined,
    replacement: Uint8Array<ArrayBuffer>
  ): Promise<boolean> | boolean {
    return this.#delegate.compareAndSwap(path, expected, replacement)
  }

  compareAndDelete(
    path: string,
    expected: Uint8Array<ArrayBuffer> | undefined
  ): Promise<boolean> | boolean {
    return this.#delegate.compareAndDelete(path, expected)
  }

  list(query: GraftListQuery): Promise<GraftListResult> | GraftListResult {
    return this.#delegate.list(query)
  }

  private async stageUnknownLength(
    stream: ReadableStream<Uint8Array>
  ): Promise<StagedR2Body> {
    const key =
      "__eidos_sync_staging/" +
      encodeURIComponent(this.#repositoryId) +
      "/" +
      crypto.randomUUID()
    const upload = await this.#objects.createMultipartUpload(key, {
      httpMetadata: { contentType: "application/octet-stream" },
    })
    const reader = stream.getReader()
    const parts: R2UploadedPart[] = []
    let part = new Uint8Array(R2_MULTIPART_PART_BYTES)
    let partBytes = 0
    let totalBytes = 0
    let completed = false

    try {
      while (true) {
        const result = await reader.read()
        if (result.done) break
        let offset = 0
        while (offset < result.value.byteLength) {
          const copied = Math.min(
            part.byteLength - partBytes,
            result.value.byteLength - offset
          )
          part.set(result.value.subarray(offset, offset + copied), partBytes)
          partBytes += copied
          totalBytes += copied
          offset += copied
          if (partBytes === part.byteLength) {
            parts.push(await upload.uploadPart(parts.length + 1, part))
            part = new Uint8Array(R2_MULTIPART_PART_BYTES)
            partBytes = 0
          }
        }
      }

      if (totalBytes === 0) {
        await upload.abort()
        await this.#objects.put(key, new Uint8Array())
      } else {
        if (partBytes > 0) {
          parts.push(
            await upload.uploadPart(
              parts.length + 1,
              part.subarray(0, partBytes)
            )
          )
        }
        await upload.complete(parts)
      }
      completed = true
    } catch (error) {
      try {
        await reader.cancel(error)
      } catch {
        // The input may already be closed after a storage failure.
      }
      if (!completed) {
        try {
          await upload.abort()
        } catch {
          // Preserve the original failure. R2 expires incomplete uploads.
        }
      }
      try {
        await this.#objects.delete(key)
      } catch {
        // Preserve the original failure; the staging prefix is not public.
      }
      throw error
    }

    const object = await this.#objects.get(key)
    if (object === null) {
      await this.#objects.delete(key)
      throw new Error("Staged immutable object is missing")
    }
    const fixedLength = new FixedLengthStream(object.size)
    const bodyCompleted = object.body.pipeTo(fixedLength.writable)
    // The delegate consumes the readable side. Attach a rejection handler now
    // so a storage failure cannot surface as an unhandled promise rejection
    // before putIfAbsent has returned control to this adapter.
    void bodyCompleted.catch(() => undefined)
    return {
      body: fixedLength.readable as ReadableStream<Uint8Array>,
      bodyCompleted,
      key,
      size: object.size,
    }
  }

  private async finishStagedBody(
    staged: StagedR2Body,
    consumed: boolean
  ): Promise<void> {
    if (!consumed && !staged.body.locked) {
      await staged.body.cancel("create-only target already exists")
    }
    try {
      await staged.bodyCompleted
    } catch (error) {
      if (consumed) throw error
    }
  }

  private async abandonStagedBody(staged: StagedR2Body): Promise<void> {
    if (!staged.body.locked) {
      try {
        await staged.body.cancel("immutable storage did not consume the body")
      } catch {
        // The delegate may have already released a failed reader.
      }
    }
    try {
      await staged.bodyCompleted
    } catch {
      // The storage failure is reported by the delegate.
    }
  }

  private async cleanupStaged(staged: StagedR2Body): Promise<void> {
    try {
      await this.#objects.delete(staged.key)
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "sync upload staging cleanup failed",
          error: error instanceof Error ? error.message : String(error),
        })
      )
    }
  }
}

export function parseContentLength(request: Request): number | null {
  const value = request.headers.get("content-length")
  if (value === null) return null
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new GraftProtocolError(
      400,
      "invalid_content_length",
      "Content-Length must be a non-negative integer"
    )
  }
  const bytes = Number(value)
  if (!Number.isSafeInteger(bytes)) {
    throw new GraftProtocolError(
      413,
      "content_length_too_large",
      "Content-Length exceeds the supported range"
    )
  }
  return bytes
}

export function quotaMode(value: string): SyncQuotaMode {
  if (value === "off" || value === "shadow" || value === "enforce") {
    return value
  }
  throw new GraftProtocolError(
    503,
    "quota_service_not_configured",
    "Sync quota enforcement is not configured"
  )
}

function quotaExceeded(summary: SyncUsageSummary): GraftProtocolError {
  return new GraftProtocolError(
    413,
    "sync_quota_exceeded",
    `Eidos Sync storage quota exceeded (${summary.usedBytes}/${summary.quotaBytes} bytes used)`
  )
}
