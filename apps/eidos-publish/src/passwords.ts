const encoder = new TextEncoder()

export const PASSWORD_PBKDF2_ITERATIONS = 100_000
export const PASSWORD_PBKDF2_ROUNDS = 6
export const PASSWORD_TOTAL_ITERATIONS =
  PASSWORD_PBKDF2_ITERATIONS * PASSWORD_PBKDF2_ROUNDS
export const PASSWORD_MIN_CHARACTERS = 8
export const PASSWORD_MAX_CHARACTERS = 128
export const PASSWORD_MAX_BYTES = 256

export interface PublicationPasswordVerifier {
  algorithm: "pbkdf2-sha256-chain-v1+hmac-sha256"
  iterations: number
  salt: string
  hash: string
}

export function validPublicationPassword(password: string): boolean {
  const characters = [...password].length
  const bytes = encoder.encode(password).byteLength
  return (
    characters >= PASSWORD_MIN_CHARACTERS &&
    characters <= PASSWORD_MAX_CHARACTERS &&
    bytes <= PASSWORD_MAX_BYTES &&
    !/[\u0000-\u001f\u007f]/u.test(password)
  )
}

export async function createPublicationPasswordVerifier(
  password: string,
  pepper: string
): Promise<PublicationPasswordVerifier> {
  requirePassword(password)
  requirePepper(pepper)
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return {
    algorithm: "pbkdf2-sha256-chain-v1+hmac-sha256",
    iterations: PASSWORD_PBKDF2_ITERATIONS,
    salt: base64Url(salt),
    hash: base64Url(
      await passwordHash(password, salt, PASSWORD_PBKDF2_ITERATIONS, pepper)
    ),
  }
}

export async function verifyPublicationPassword(
  password: string,
  verifier: PublicationPasswordVerifier,
  pepper: string
): Promise<boolean> {
  if (
    !validPublicationPassword(password) ||
    verifier.algorithm !== "pbkdf2-sha256-chain-v1+hmac-sha256" ||
    !Number.isSafeInteger(verifier.iterations) ||
    verifier.iterations !== PASSWORD_PBKDF2_ITERATIONS ||
    !/^[A-Za-z0-9_-]{22}$/.test(verifier.salt) ||
    !/^[A-Za-z0-9_-]{43}$/.test(verifier.hash)
  ) {
    return false
  }
  requirePepper(pepper)
  let expected: Uint8Array
  try {
    expected = base64UrlDecode(verifier.hash)
  } catch {
    return false
  }
  const actual = await passwordHash(
    password,
    base64UrlDecode(verifier.salt),
    verifier.iterations,
    pepper
  )
  return crypto.subtle.timingSafeEqual(actual, expected)
}

async function passwordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
  pepper: string
): Promise<Uint8Array> {
  let input = encoder.encode(password)
  for (let round = 0; round < PASSWORD_PBKDF2_ROUNDS; round += 1) {
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      input.slice().buffer,
      "PBKDF2",
      false,
      ["deriveBits"]
    )
    const roundSalt = new Uint8Array(salt.byteLength + 1)
    roundSalt.set(salt)
    roundSalt[salt.byteLength] = round
    input = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: roundSalt.buffer,
          iterations,
        },
        passwordKey,
        256
      )
    )
  }
  const pepperKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  return new Uint8Array(await crypto.subtle.sign("HMAC", pepperKey, input))
}

function requirePassword(password: string): void {
  if (!validPublicationPassword(password)) {
    throw new Error("Publication password is invalid")
  }
}

function requirePepper(pepper: string): void {
  if (encoder.encode(pepper ?? "").byteLength < 32) {
    throw new Error("PUBLISH_PASSWORD_PEPPER must contain at least 32 bytes")
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
