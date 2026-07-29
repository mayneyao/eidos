import { GraftProtocolError } from "@eidos.space/graft-remote";

const encoder = new TextEncoder();

interface TimingSafeSubtleCrypto extends SubtleCrypto {
  timingSafeEqual(
    left: ArrayBuffer | ArrayBufferView,
    right: ArrayBuffer | ArrayBufferView,
  ): boolean;
}

export async function requireBearerToken(request: Request, expectedToken: string): Promise<void> {
  const authorization = request.headers.get("authorization") ?? "";
  const providedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(providedToken)),
    crypto.subtle.digest("SHA-256", encoder.encode(expectedToken)),
  ]);
  if (!supportsTimingSafeEqual(crypto.subtle)) {
    throw new GraftProtocolError(500, "crypto_unavailable", "Timing-safe comparison is unavailable");
  }
  if (!crypto.subtle.timingSafeEqual(providedHash, expectedHash)) {
    throw new GraftProtocolError(401, "unauthorized", "A valid bearer token is required", {
      "WWW-Authenticate": 'Bearer realm="graft-remote"',
    });
  }
}

function supportsTimingSafeEqual(subtle: SubtleCrypto): subtle is TimingSafeSubtleCrypto {
  return "timingSafeEqual" in subtle && typeof subtle.timingSafeEqual === "function";
}
