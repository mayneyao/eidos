import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  EidosPublishEngine,
  collectCliArguments,
  observePublishSource,
  parsePublishProgress,
  requiredPublicationBindingsRequest,
  requiredPublishCollectRequest,
  requiredPublishRequest,
} from "./publish-engine"

describe("Eidos Publish engine boundary", () => {
  it("does not expose an automatic background Form collector", () => {
    expect("setActiveCollectorSource" in EidosPublishEngine.prototype).toBe(
      false
    )
  })

  it("accepts a bounded password request without putting the secret in arguments", () => {
    expect(
      requiredPublishRequest({
        requestId: "019abcde-1234-7abc-8abc-123456789abc",
        relativePath: "Projects/demo.eidos",
        slug: "my-demo",
        accessMode: "password",
        branding: "hide",
        password: "correct horse",
      })
    ).toMatchObject({
      slug: "my-demo",
      accessMode: "password",
      branding: "hide",
    })
  })

  it("rejects unsafe slugs, paths, and passwords", () => {
    for (const request of [
      {
        requestId: "019abcde-1234-7abc-8abc-123456789abc",
        relativePath: "demo.eidos",
        slug: "../demo",
        accessMode: "public",
        branding: "unchanged",
      },
      {
        requestId: "019abcde-1234-7abc-8abc-123456789abc",
        relativePath: "notes.txt",
        slug: "notes",
        accessMode: "public",
        branding: "unchanged",
      },
      {
        requestId: "019abcde-1234-7abc-8abc-123456789abc",
        relativePath: "demo.eidos",
        slug: "demo",
        accessMode: "password",
        branding: "unchanged",
        password: "short",
      },
      {
        requestId: "019abcde-1234-7abc-8abc-123456789abc",
        relativePath: "demo.eidos",
        slug: "demo",
        accessMode: "password",
        branding: "unchanged",
        password: "🔐".repeat(65),
      },
    ]) {
      expect(() => requiredPublishRequest(request)).toThrow()
    }
  })

  it("accepts Markdown documents as Publish sources", () => {
    for (const relativePath of ["notes.md", "docs/guide.markdown"]) {
      expect(
        requiredPublishRequest({
          requestId: "019abcde-1234-7abc-8abc-123456789abc",
          relativePath,
          slug: "notes",
          accessMode: "public",
          branding: "unchanged",
        })
      ).toMatchObject({ relativePath })
    }
  })

  it("requires account identity before limiting a Form to one response", () => {
    const request = {
      requestId: "019abcde-1234-7abc-8abc-123456789abc",
      relativePath: "feedback.eidos",
      slug: "feedback",
      accessMode: "public",
      branding: "unchanged",
      formView: "view-1",
    }
    expect(
      requiredPublishRequest({
        ...request,
        formRespondentAccess: "signed_in",
        formAllowMultipleResponses: false,
      })
    ).toMatchObject({
      formRespondentAccess: "signed_in",
      formAllowMultipleResponses: false,
    })
    expect(() =>
      requiredPublishRequest({
        ...request,
        formRespondentAccess: "anyone",
        formAllowMultipleResponses: false,
      })
    ).toThrow("Invalid published Form response access")
  })

  it("counts password Unicode scalars instead of UTF-16 code units", () => {
    expect(
      requiredPublishRequest({
        requestId: "019abcde-1234-7abc-8abc-123456789abc",
        relativePath: "demo.eidos",
        slug: "demo",
        accessMode: "password",
        branding: "unchanged",
        password: "🔐".repeat(8),
      })
    ).toMatchObject({ accessMode: "password" })
  })

  it("parses only bounded structured progress events", () => {
    expect(
      parsePublishProgress(
        "request-1",
        JSON.stringify({
          type: "publish-progress",
          kind: "bytes",
          label: "uploading source",
          currentBytes: "32",
          totalBytes: "128",
          percent: 25,
        })
      )
    ).toEqual({
      requestId: "request-1",
      kind: "bytes",
      label: "uploading source",
      currentBytes: "32",
      totalBytes: "128",
      percent: 25,
    })
    expect(parsePublishProgress("request-1", "publish: 25%")).toBeNull()
  })

  it("accepts only an Eidos File and lowercase publication UUID for Collect", () => {
    expect(
      requiredPublishCollectRequest({
        requestId: "019abcde-1234-7abc-8abc-123456789abc",
        relativePath: "feedback.eidos",
        publicationId: "7300a083-df92-49d8-945d-1e0bae0eac18",
      })
    ).toMatchObject({ relativePath: "feedback.eidos" })
    expect(() =>
      requiredPublishCollectRequest({
        requestId: "019abcde-1234-7abc-8abc-123456789abc",
        relativePath: "feedback.md",
        publicationId: "7300A083-DF92-49D8-945D-1E0BAE0EAC18",
      })
    ).toThrow()
  })

  it("accepts only a bounded optional source path when listing bindings", () => {
    expect(requiredPublicationBindingsRequest(undefined)).toEqual({})
    expect(
      requiredPublicationBindingsRequest({ relativePath: "docs/demo.eidos" })
    ).toEqual({ relativePath: "docs/demo.eidos" })
    expect(() =>
      requiredPublicationBindingsRequest({ relativePath: "demo.eidos\n" })
    ).toThrow()
    expect(() =>
      requiredPublicationBindingsRequest({ unexpected: true })
    ).toThrow()
  })

  it("reuses a Collector generation without passing a credential in argv", () => {
    expect(
      collectCliArguments(
        "/tmp/form.eidos",
        "/tmp",
        "7300a083-df92-49d8-945d-1e0bae0eac18",
        "eidos-lite-12345678901234567890123456789012",
        "https://publish-staging.eidos.space",
        7
      )
    ).toEqual([
      "--json",
      "collect",
      "/tmp/form.eidos",
      "--publication",
      "7300a083-df92-49d8-945d-1e0bae0eac18",
      "--publish-origin",
      "https://publish-staging.eidos.space",
      "--attachment-root",
      "/tmp",
      "--collector-id",
      "eidos-lite-12345678901234567890123456789012",
      "--collector-generation",
      "7",
    ])
  })

  it("observes source and attachment metadata without reading their contents", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "publish-observe-"))
    try {
      await mkdir(path.join(directory, "assets"))
      const sourcePath = path.join(directory, "notes.md")
      await writeFile(sourcePath, "# Notes")
      await writeFile(path.join(directory, "assets", "diagram.png"), "png")

      const first = await observePublishSource(sourcePath, [
        "assets/diagram.png",
      ])
      const second = await observePublishSource(sourcePath, [
        "assets/diagram.png",
      ])
      expect(second).toEqual(first)
      expect(first).toMatchObject({
        spec: "eidos.publish/local-observation@1",
        source: { bytes: "7" },
        attachments: [{ path: "assets/diagram.png", bytes: "3" }],
      })

      const captured = await observePublishSource(
        sourcePath,
        ["assets/diagram.png"],
        undefined,
        {
          token: "opaque-snapshot-token",
          contentFingerprint: `graft-sqlite-v1:${"a".repeat(64)}`,
        }
      )
      expect(captured.graftSnapshot).toEqual({
        token: "opaque-snapshot-token",
        contentFingerprint: `graft-sqlite-v1:${"a".repeat(64)}`,
      })

      await expect(
        observePublishSource(sourcePath, ["../secret.txt"])
      ).rejects.toThrow("invalid attachment path")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
