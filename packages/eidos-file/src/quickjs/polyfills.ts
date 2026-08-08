import { base64ToBytes, bytesToBase64 } from "./wire"
import type { QuickJsHostBridge } from "./port"

const host = (): QuickJsHostBridge =>
  (globalThis as unknown as { __eidos_host: QuickJsHostBridge }).__eidos_host

class QuickJsTextEncoder {
  encode(value = ""): Uint8Array {
    const out: number[] = []
    for (let index = 0; index < value.length; index += 1) {
      let code = value.charCodeAt(index)
      if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
        const next = value.charCodeAt(index + 1)
        if (next >= 0xdc00 && next <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
          index += 1
        } else {
          code = 0xfffd
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        code = 0xfffd
      }
      if (code < 0x80) {
        out.push(code)
      } else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 63))
      } else if (code < 0x10000) {
        out.push(
          0xe0 | (code >> 12),
          0x80 | ((code >> 6) & 63),
          0x80 | (code & 63)
        )
      } else {
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 63),
          0x80 | ((code >> 6) & 63),
          0x80 | (code & 63)
        )
      }
    }
    return new Uint8Array(out)
  }
}

class QuickJsTextDecoder {
  private readonly fatal: boolean

  constructor(_encoding = "utf-8", options?: { fatal?: boolean }) {
    this.fatal = options?.fatal === true
  }

  decode(input?: Uint8Array | ArrayBuffer): string {
    const bytes =
      input === undefined
        ? new Uint8Array(0)
        : input instanceof Uint8Array
          ? input
          : new Uint8Array(input)
    let out = ""
    let index = 0
    const fail = (): number => {
      if (this.fatal) throw new TypeError("The encoded data was not valid")
      return 0xfffd
    }
    while (index < bytes.length) {
      const first = bytes[index]!
      let code: number
      let length: number
      if (first < 0x80) {
        code = first
        length = 1
      } else if ((first & 0xe0) === 0xc0) {
        code = first & 0x1f
        length = 2
      } else if ((first & 0xf0) === 0xe0) {
        code = first & 0x0f
        length = 3
      } else if ((first & 0xf8) === 0xf0) {
        code = first & 0x07
        length = 4
      } else {
        code = fail()
        length = 1
      }
      let valid = length > 1 && index + length <= bytes.length
      if (valid) {
        for (let offset = 1; offset < length; offset += 1) {
          const next = bytes[index + offset]!
          if ((next & 0xc0) !== 0x80) {
            valid = false
            break
          }
          code = (code << 6) | (next & 63)
        }
        if (valid) {
          const overlong =
            (length === 2 && code < 0x80) ||
            (length === 3 && code < 0x800) ||
            (length === 4 && code < 0x10000)
          const surrogate = code >= 0xd800 && code <= 0xdfff
          if (overlong || surrogate || code > 0x10ffff) valid = false
        }
      }
      if (!valid && length > 1) {
        code = fail()
        length = 1
      }
      if (code < 0x10000) {
        out += String.fromCharCode(code)
      } else {
        code -= 0x10000
        out += String.fromCharCode(
          0xd800 + (code >> 10),
          0xdc00 + (code & 1023)
        )
      }
      index += length
    }
    return out
  }
}

export function installQuickJsPolyfills(): void {
  const target = globalThis as Record<string, unknown>
  if (typeof target.TextEncoder !== "function") {
    target.TextEncoder = QuickJsTextEncoder
  }
  if (typeof target.TextDecoder !== "function") {
    target.TextDecoder = QuickJsTextDecoder
  }
  if (typeof target.setTimeout !== "function") {
    target.setTimeout = (callback: () => void, _ms?: number) => {
      void Promise.resolve().then(callback)
      return 0
    }
    target.clearTimeout = () => undefined
  }
  if (typeof target.queueMicrotask !== "function") {
    target.queueMicrotask = (callback: () => void) => {
      void Promise.resolve().then(callback)
    }
  }
  if (typeof target.performance !== "object") {
    target.performance = { now: () => Date.now() }
  }
  const crypto = {
    getRandomValues(array: Uint8Array): Uint8Array {
      const bytes = base64ToBytes(host().randomBytes(array.length))
      array.set(bytes.subarray(0, array.length))
      return array
    },
    subtle: {
      digest(
        algorithm: string,
        data: Uint8Array | ArrayBuffer
      ): Promise<ArrayBuffer> {
        if (!/^SHA-?256$/i.test(algorithm)) {
          return Promise.reject(new Error("Only SHA-256 is supported"))
        }
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
        const digest = base64ToBytes(host().sha256(bytesToBase64(bytes)))
        const result = new Uint8Array(digest.byteLength)
        result.set(digest)
        return Promise.resolve(result.buffer)
      },
    },
    randomUUID(): string {
      const bytes = base64ToBytes(host().randomBytes(16))
      bytes[6] = (bytes[6]! & 0x0f) | 0x40
      bytes[8] = (bytes[8]! & 0x3f) | 0x80
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
      return (
        hex.slice(0, 4).join("") +
        "-" +
        hex.slice(4, 6).join("") +
        "-" +
        hex.slice(6, 8).join("") +
        "-" +
        hex.slice(8, 10).join("") +
        "-" +
        hex.slice(10, 16).join("")
      )
    },
  }
  if (typeof target.crypto !== "object") {
    target.crypto = crypto
  }
  if (typeof target.console !== "object") {
    const log =
      (level: string) =>
      (...parts: unknown[]) => {
        try {
          host().log(level, parts.map(String).join(" "))
        } catch {
          // logging must never break the runtime
        }
      }
    target.console = {
      log: log("info"),
      info: log("info"),
      warn: log("warn"),
      error: log("error"),
      debug: log("debug"),
    }
  }
}

// Must self-execute at module evaluation time: runtime-service dependencies
// capture TextEncoder at their own module top level, so the polyfills have to
// be installed before any other bundled module evaluates. The entry imports
// this module first to guarantee ordering.
installQuickJsPolyfills()
