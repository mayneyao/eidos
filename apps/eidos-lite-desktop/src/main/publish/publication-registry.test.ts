import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import type {
  EidosPublishRequest,
  EidosPublishResult,
} from "../../shared/contracts"
import {
  PublicationRegistry,
  type PublicationSourceObservation,
  type PublicationRegistryScope,
} from "./publication-registry"

const temporaryDirectories: string[] = []

const scope: PublicationRegistryScope = {
  serviceOrigin: "https://publish-staging.eidos.space",
  accountId: "user-1",
  spaceId: "space-1",
}

const request: EidosPublishRequest = {
  requestId: "019abcde-1234-7abc-8abc-123456789abc",
  relativePath: "Feedback.eidos",
  slug: "feedback",
  accessMode: "unchanged",
  branding: "unchanged",
  formView: "view-1",
  formRespondentAccess: "anyone",
  formAllowMultipleResponses: true,
}

const result: EidosPublishResult = {
  published: true,
  ready: true,
  versionCreated: true,
  fingerprintSpec: "eidos.publish/source-bundle@1",
  publishFingerprint: "d".repeat(64),
  driverId: "org.eidos.driver.form",
  mediaType: "application/vnd.eidos.form+json",
  publicationId: "7300a083-df92-49d8-945d-1e0bae0eac18",
  publicationSlug: "feedback",
  visibility: "public",
  accessMode: "public",
  showBranding: true,
  formPolicy: {
    respondentAccess: "anyone",
    allowMultipleResponses: true,
    revision: 0,
  },
  versionId: "8300a083-df92-49d8-945d-1e0bae0eac18",
  sourceBytes: "1024",
  sourceSha256: "a".repeat(64),
  attachmentFiles: 0,
  attachmentReferences: 0,
  attachmentPaths: [],
  attachmentBytes: "0",
  bundleBytes: "1024",
  deduplicatedBytes: "0",
  servingTargetSha256: "b".repeat(64),
  url: "https://u-example-staging.eidos.ink/feedback",
}

const localObservation: PublicationSourceObservation = {
  spec: "eidos.publish/local-observation@1",
  source: {
    bytes: "1024",
    modifiedNs: "123456789",
    changedNs: "123456789",
    device: "1",
    inode: "2",
  },
  attachments: [],
  graftSnapshot: {
    token: "opaque-snapshot-token",
    contentFingerprint: `graft-sqlite-v1:${"c".repeat(64)}`,
  },
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function createRegistry(): PublicationRegistry {
  const directory = mkdtempSync(path.join(os.tmpdir(), "eidos-publish-state-"))
  temporaryDirectories.push(directory)
  return new PublicationRegistry(path.join(directory, "publish-state.sqlite"))
}

describe("PublicationRegistry", () => {
  it("restores bindings after the Lite process reopens the Space", () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "eidos-publish-state-")
    )
    temporaryDirectories.push(directory)
    const filePath = path.join(directory, "publish-state.sqlite")
    const first = new PublicationRegistry(filePath)
    first.upsertPublished(scope, request, result, localObservation)
    first.close()

    const reopened = new PublicationRegistry(filePath)
    expect(reopened.list(scope)).toMatchObject([
      {
        publicationId: result.publicationId,
        relativePath: request.relativePath,
        publishFingerprint: result.publishFingerprint,
        localObservation,
      },
    ])
    reopened.close()
  })

  it("persists an account- and environment-scoped source binding", () => {
    const registry = createRegistry()
    registry.upsertPublished(scope, request, result, localObservation)

    expect(registry.list(scope, "Feedback.eidos")).toMatchObject([
      {
        relativePath: "Feedback.eidos",
        sourceKind: "form",
        formViewId: "view-1",
        publicationId: result.publicationId,
        currentVersionId: result.versionId,
        publishFingerprint: result.publishFingerprint,
        localObservation,
        lastResult: result,
        collector: null,
      },
    ])
    expect(registry.list({ ...scope, accountId: "another-user" })).toEqual([])
    registry.close()
  })

  it("updates the current version without losing collector history", () => {
    const registry = createRegistry()
    registry.upsertPublished(scope, request, result)
    registry.recordCollectionAttempt(scope, result.publicationId)
    registry.recordCollectionSuccess(scope, {
      collected: true,
      publicationId: result.publicationId,
      collectorId: "eidos-lite-12345678901234567890123456789012",
      collectorGeneration: 3,
      importedSubmissions: 2,
      replayedSubmissions: 1,
    })
    registry.upsertPublished(scope, request, {
      ...result,
      versionId: "9300a083-df92-49d8-945d-1e0bae0eac18",
      sourceSha256: "c".repeat(64),
    })

    expect(registry.list(scope)[0]).toMatchObject({
      currentVersionId: "9300a083-df92-49d8-945d-1e0bae0eac18",
      collector: {
        collectorGeneration: 3,
        importedSubmissions: 2,
        replayedSubmissions: 1,
        lastErrorCode: null,
      },
    })
    registry.close()
  })

  it("persists Collector ownership independently from an import run", () => {
    const registry = createRegistry()
    registry.upsertPublished(scope, request, result)
    registry.recordCollectorOwnership(
      scope,
      result.publicationId,
      "eidos-lite-12345678901234567890123456789012",
      4
    )

    expect(registry.list(scope)[0]?.collector).toMatchObject({
      collectorId: "eidos-lite-12345678901234567890123456789012",
      collectorGeneration: 4,
      lastAttemptedAt: null,
    })
    registry.close()
  })

  it("persists a bounded collection failure for later re-entry", () => {
    const registry = createRegistry()
    registry.upsertPublished(scope, request, result)
    registry.recordCollectionFailure(
      scope,
      result.publicationId,
      "schema_mismatch",
      "The local schema changed"
    )

    expect(registry.list(scope)[0]?.collector).toMatchObject({
      lastErrorCode: "schema_mismatch",
      lastErrorMessage: "The local schema changed",
      lastSucceededAt: null,
    })
    registry.close()
  })

  it("keeps file and nested bindings attached across a Lite rename", () => {
    const registry = createRegistry()
    registry.upsertPublished(scope, request, result)
    registry.upsertPublished(
      scope,
      { ...request, relativePath: "Folder/Feedback.eidos", slug: "nested" },
      {
        ...result,
        publicationId: "a300a083-df92-49d8-945d-1e0bae0eac18",
        publicationSlug: "nested",
      }
    )

    registry.remapSourcePaths(scope.spaceId, "Feedback.eidos", "Survey.eidos")
    registry.remapSourcePaths(scope.spaceId, "Folder", "Archive")

    expect(
      registry
        .list(scope)
        .map((binding) => binding.relativePath)
        .sort()
    ).toEqual(["Archive/Feedback.eidos", "Survey.eidos"])
    registry.close()
  })
})
