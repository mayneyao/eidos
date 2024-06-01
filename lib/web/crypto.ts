export const getKeyPair = async () => {
  return await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-384",
    },
    true,
    ["sign", "verify"]
  )
}

export const PUBLIC_KEY = {
  crv: "P-384",
  ext: true,
  key_ops: ["verify"],
  kty: "EC",
  x: "vzAlzjI0gj33P7VKcfjAWxnTIlnGq_CV-qambJ1tiNEYleQo7ZTmm9kKelu1TzL5",
  y: "GLrYixRU-kK92z0WafWadYIwVJnUXH2cqidRrThZ_4JC1-okmYUY_C2FsVxK-AS1",
}

function getMessageEncoding(payload: object) {
  let enc = new TextEncoder()
  const jsonStr = JSON.stringify(payload)
  return enc.encode(jsonStr)
}

async function loadPublicKey() {
  return window.crypto.subtle.importKey(
    "jwk",
    PUBLIC_KEY,
    {
      name: "ECDSA",
      namedCurve: "P-384",
    },
    true,
    ["verify"]
  )
}

export async function verifyMessage(payload: object, signature: ArrayBuffer) {
  let encoded = getMessageEncoding(payload)
  const publicKey = await loadPublicKey()
  return await window.crypto.subtle.verify(
    {
      name: "ECDSA",
      hash: { name: "SHA-384" },
    },
    publicKey,
    signature,
    encoded
  )
}

/**
 * file checksum sha3-256
 * return checksum
 */
export async function fileChecksum(file: File): Promise<string> {
  const worker = new Worker(
    new URL("@/worker/web-worker/checksum.ts", import.meta.url),
    {
      type: "module",
    }
  )
  const promise = new Promise<string>((resolve) => {
    worker.onmessage = (event) => {
      resolve(event.data)
    }
  })
  worker.postMessage({ file })
  return promise
}
