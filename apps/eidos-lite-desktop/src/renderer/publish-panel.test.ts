import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  clampPublishPanelPosition,
  defaultPublishSlug,
  isPublishableEntry,
  publishMenuAvailability,
  publishedFormRespondentLabel,
  publishFormViewLabel,
  publishPlanRestriction,
} from "./publish-panel"
import type { EidosPublishAccountStatus } from "../shared/contracts"

const source = readFileSync(
  new URL("./publish-panel.tsx", import.meta.url),
  "utf8"
)

describe("Publish panel", () => {
  const free: EidosPublishAccountStatus = {
    state: "active",
    plan: "free",
    privatePublications: false,
    removeBranding: false,
    maxStorageBytes: "104857600",
    usedStorageBytes: "0",
    activeSlugs: [],
    accountUrl: "https://eidos.space/account?tab=publish",
    pricingUrl: "https://eidos.space/pricing#publish",
  }
  it("explains unsupported Free sources and permits republishing an occupied slot", () => {
    expect(publishPlanRestriction(free, "markdown", "report")).toBeNull()
    expect(publishPlanRestriction(free, "eidos-file", "report")).toContain(
      "require Publish Pro"
    )
    expect(publishPlanRestriction(free, "form", "report")).toContain(
      "require Publish Pro"
    )
    const full = {
      ...free,
      activeSlugs: Array.from({ length: 10 }, (_, index) => `page-${index}`),
    }
    expect(publishPlanRestriction(full, "markdown", "another")).toContain(
      "All 10 pages"
    )
    expect(publishPlanRestriction(full, "markdown", "page-0")).toBeNull()
    expect(
      publishPlanRestriction({ ...full, plan: "pro" }, "form", "another")
    ).toBeNull()
    expect(
      publishPlanRestriction(
        { ...free, state: "blocked" },
        "markdown",
        "report"
      )
    ).toContain("verify your email")
    expect(
      publishPlanRestriction(
        { ...free, activeSlugs: null },
        "markdown",
        "report"
      )
    ).toBeNull()
  })
  it("preserves the Space-relative path as the editable default", () => {
    expect(defaultPublishSlug("Project Notes.eidos", true)).toBe(
      "Project Notes.eidos"
    )
    expect(defaultPublishSlug("运动/2026/骑行.gpx", true)).toBe(
      "运动/2026/骑行.gpx"
    )
    expect(defaultPublishSlug("docs/Release Notes.markdown", true)).toBe(
      "docs/Release Notes.markdown"
    )
  })

  it("retains production URLs and limits ordinary files to staging", () => {
    expect(defaultPublishSlug("docs/Release Notes.markdown")).toBe(
      "release-notes"
    )
    expect(defaultPublishSlug("笔记/中文.md")).toBe("untitled")
    const ordinary = {
      name: "notes.txt",
      relativePath: "notes.txt",
      kind: "file" as const,
      size: 1,
      modifiedAtMs: 1,
    }
    expect(isPublishableEntry(ordinary)).toBe(false)
    expect(isPublishableEntry(ordinary, true)).toBe(true)
    expect(
      isPublishableEntry({
        name: "guide.md",
        relativePath: "guide.md",
        kind: "file",
        size: 1,
        modifiedAtMs: 1,
      })
    ).toBe(true)
    expect(
      isPublishableEntry(
        {
          name: "notes.txt",
          relativePath: "notes.txt",
          kind: "file",
          size: 1,
          modifiedAtMs: 1,
        },
        true
      )
    ).toBe(true)
  })

  it("keeps Publish visible but unavailable until an account is signed in", () => {
    expect(publishMenuAvailability("signed-out", false)).toEqual({
      disabled: true,
      label: "Publish… (Sign in required)",
    })
    expect(publishMenuAvailability("checking", false)).toEqual({
      disabled: true,
      label: "Publish… (Checking account…)",
    })
    expect(publishMenuAvailability("unavailable", false)).toEqual({
      disabled: true,
      label: "Publish… (Account unavailable)",
    })
    expect(publishMenuAvailability("signed-in", false)).toEqual({
      disabled: false,
      label: null,
    })
    expect(publishMenuAvailability("signed-in", true).disabled).toBe(true)
  })

  it("identifies Form publish targets by Table and View name", () => {
    expect(
      publishFormViewLabel("Form", {
        name: "Form 1",
        tableName: "Contacts",
      })
    ).toBe("Form · Contacts · Form 1")
    expect(
      publishFormViewLabel("表单", {
        name: "表单 1",
        tableName: "客户",
      })
    ).toBe("表单 · 客户 · 表单 1")
  })

  it("distinguishes published Forms by their respondent access", () => {
    expect(
      publishedFormRespondentLabel({
        sourceKind: "form",
        formPolicy: {
          respondentAccess: "signed_in",
          allowMultipleResponses: true,
          revision: 2,
        },
      })
    ).toBe("Signed-in eidos.space users")
    expect(
      publishedFormRespondentLabel({
        sourceKind: "form",
        formPolicy: {
          respondentAccess: "anyone",
          allowMultipleResponses: true,
          revision: 0,
        },
      })
    ).toBe("Anyone with the link")
    expect(
      publishedFormRespondentLabel({
        sourceKind: "markdown",
        formPolicy: null,
      })
    ).toBeNull()
  })

  it("publishes optimistically from a cached plan instead of a live check", () => {
    expect(source).toContain("usePublishAccount")
    expect(source).toContain("publish-plan-note")
    expect(source).not.toContain("publish-plan-summary")
    expect(source).not.toContain("getPublishAccountStatus")
    expect(source).not.toContain("Manage published pages")
    expect(source).toContain("if (validation) return")
  })

  it("keeps the measured panel inside the viewport near its anchor", () => {
    expect(clampPublishPanelPosition(700, 500, 352, 220, 800, 600)).toEqual({
      left: 440,
      top: 372,
    })
    expect(clampPublishPanelPosition(2, 3, 352, 720, 320, 600)).toEqual({
      left: 8,
      top: 8,
    })
  })
})
