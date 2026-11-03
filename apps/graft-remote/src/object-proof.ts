import { createHash } from "node:crypto"
import {
  GraftProtocolError,
  type GraftRepositoryBackend,
  type MaybePromise,
} from "@eidos.space/graft-remote"

export type ObjectProofBackend = GraftRepositoryBackend & {
  encryptedObjectProof?: (
    path: string,
    prefix: Uint8Array<ArrayBuffer>
  ) => MaybePromise<{ size: number; sha256: string } | null>
}

/** Read one persisted immutable R2 snapshot, never upload receipts or cached digests. */
export function withObjectProof(
  backend: GraftRepositoryBackend,
  signal?: AbortSignal,
  timeoutMs = 60_000
): ObjectProofBackend {
  if (!backend.encryption) return backend
  return Object.assign(backend, {
    async encryptedObjectProof(path: string, prefix: Uint8Array<ArrayBuffer>) {
      if (
        !/^e2ee\/(objects|packs|indexes|files|commits|segments)\/[0-9a-f]{64}$/.test(
          path
        ) ||
        prefix.byteLength > 512
      )
        throw new GraftProtocolError(
          400,
          "invalid_proof_request",
          "Invalid object proof request"
        )
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      let stopped = false
      let rejectStopped!: (error: Error) => void
      const interrupted = new Promise<never>((_, reject) => {
        rejectStopped = reject
      })
      const stop = () => {
        stopped = true
        void reader?.cancel("Object proof interrupted").catch(() => undefined)
        rejectStopped(
          new GraftProtocolError(
            503,
            "object_proof_interrupted",
            "Object proof interrupted"
          )
        )
      }
      const timer = setTimeout(stop, timeoutMs)
      signal?.addEventListener("abort", stop, { once: true })
      const hashSnapshot = async () => {
        const object = await backend.get(path)
        if (stopped) {
          if (object?.body instanceof ReadableStream)
            void object.body.cancel().catch(() => undefined)
          throw new GraftProtocolError(
            503,
            "object_proof_interrupted",
            "Object proof interrupted"
          )
        }
        if (!object) return null
        const hash = createHash("sha256").update(prefix)
        let size = 0
        if (object.body instanceof ReadableStream) {
          reader = object.body.getReader()
          for (;;) {
            const chunk = await reader.read()
            if (stopped)
              throw new GraftProtocolError(
                503,
                "object_proof_interrupted",
                "Object proof interrupted"
              )
            if (chunk.done) break
            size += chunk.value.byteLength
            if (size > object.size)
              throw new GraftProtocolError(
                409,
                "object_length_mismatch",
                "Stored object length changed"
              )
            hash.update(chunk.value)
          }
        } else {
          const bytes =
            object.body instanceof Uint8Array
              ? object.body
              : new Uint8Array(object.body)
          size = bytes.byteLength
          hash.update(bytes)
        }
        if (size !== object.size)
          throw new GraftProtocolError(
            409,
            "object_length_mismatch",
            "Stored object length changed"
          )
        return { size, sha256: hash.digest("hex") }
      }
      try {
        if (signal?.aborted) stop()
        return await Promise.race([interrupted, hashSnapshot()])
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener("abort", stop)
        void reader?.cancel().catch(() => undefined)
        reader?.releaseLock()
      }
    },
  })
}
