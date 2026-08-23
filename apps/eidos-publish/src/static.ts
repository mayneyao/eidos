import { sha256 } from "@noble/hashes/sha2.js"

import { canonicalJsonBytes, canonicalSha256 } from "./canonical"
import type {
  ArtifactManifest,
  PublicationVersionRecord,
  StaticArtifactRecord,
  StaticServingTarget,
} from "./contracts"
import type { PublishTenant } from "./tenant"

export class StaticPreparationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "StaticPreparationError"
    this.code = code
  }
}

export async function prepareStaticTarget(
  env: Env,
  tenant: DurableObjectStub<PublishTenant>,
  tenantId: string,
  version: PublicationVersionRecord,
  body: Uint8Array,
  mediaType = "text/html; charset=utf-8"
): Promise<{
  target: StaticServingTarget
  targetSha256: string
  artifact: StaticArtifactRecord
}> {
  const artifactSha256 = hex(sha256(body))
  const artifactKey = artifactObjectKey(
    tenantId,
    version.publicationId,
    version.versionId,
    artifactSha256
  )
  const artifact: StaticArtifactRecord = {
    path: "index.html",
    bytes: body.byteLength.toString(),
    sha256: artifactSha256,
    mediaType,
    objectKey: artifactKey,
    state: "pending",
  }
  requireDurable(
    await tenant.reserveStaticArtifacts(version.versionId, [artifact])
  )
  await putImmutable(env.PUBLISH_OBJECTS, artifactKey, body, {
    sha256: artifactSha256,
    bytes: artifact.bytes,
    contentType: artifact.mediaType,
  })

  const artifactManifest: ArtifactManifest = {
    spec: "eidos.publish/artifact-manifest@1",
    entrypoint: artifact.path,
    files: [
      {
        path: artifact.path,
        bytes: artifact.bytes,
        sha256: artifact.sha256,
        contentType: artifact.mediaType,
      },
    ],
  }
  const manifestBytes = canonicalJsonBytes(artifactManifest)
  const manifestSha256 = await canonicalSha256(artifactManifest)
  const manifestKey = staticManifestObjectKey(
    tenantId,
    version.publicationId,
    version.versionId
  )
  await putImmutable(env.PUBLISH_OBJECTS, manifestKey, manifestBytes, {
    sha256: manifestSha256,
    bytes: manifestBytes.byteLength.toString(),
    contentType: "application/json; charset=utf-8",
  })
  requireDurable(await tenant.markStaticArtifactsReady(version.versionId))
  const target: StaticServingTarget = {
    kind: "static",
    artifactManifestKey: manifestKey,
    artifactManifestSha256: manifestSha256,
    entrypoint: artifact.path,
  }
  return {
    target,
    targetSha256: await canonicalSha256(target),
    artifact: { ...artifact, state: "ready" },
  }
}

export async function probeStaticTarget(
  env: Env,
  target: StaticServingTarget,
  artifact: StaticArtifactRecord
): Promise<void> {
  const [manifest, object] = await Promise.all([
    env.PUBLISH_OBJECTS.head(target.artifactManifestKey),
    env.PUBLISH_OBJECTS.head(artifact.objectKey),
  ])
  if (
    manifest?.customMetadata?.contentSha256 !== target.artifactManifestSha256 ||
    object?.customMetadata?.contentSha256 !== artifact.sha256 ||
    object.customMetadata.contentBytes !== artifact.bytes ||
    object.size.toString() !== artifact.bytes
  ) {
    throw new StaticPreparationError(
      "static_target_unavailable",
      "Static target did not pass its readiness probe"
    )
  }
}

async function putImmutable(
  bucket: R2Bucket,
  key: string,
  bytes: Uint8Array,
  metadata: { sha256: string; bytes: string; contentType: string }
): Promise<void> {
  const stored = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    sha256: hexBytes(metadata.sha256),
    httpMetadata: { contentType: metadata.contentType },
    customMetadata: {
      contentSha256: metadata.sha256,
      contentBytes: metadata.bytes,
    },
  })
  if (stored !== null) return
  const existing = await bucket.head(key)
  if (
    existing?.size.toString() !== metadata.bytes ||
    existing.customMetadata?.contentSha256 !== metadata.sha256 ||
    existing.customMetadata.contentBytes !== metadata.bytes
  ) {
    throw new StaticPreparationError(
      "artifact_conflict",
      "Immutable static artifact already differs"
    )
  }
}

function staticManifestObjectKey(
  tenantId: string,
  publicationId: string,
  versionId: string
): string {
  return [
    "artifacts",
    tenantId,
    publicationId,
    versionId,
    "manifest.json",
  ].join("/")
}

function artifactObjectKey(
  tenantId: string,
  publicationId: string,
  versionId: string,
  digest: string
): string {
  return [
    "artifacts",
    tenantId,
    publicationId,
    versionId,
    "objects",
    digest,
  ].join("/")
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function hexBytes(value: string): Uint8Array {
  return Uint8Array.from({ length: value.length / 2 }, (_, index) =>
    Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  )
}

function requireDurable<T>(
  result:
    | { ok: true; value: T }
    | { ok: false; error: { code: string; message: string } }
): T {
  if (result.ok) return result.value
  throw new StaticPreparationError(result.error.code, result.error.message)
}
