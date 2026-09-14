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
  it("derives a safe editable slug from an Eidos File name", () => {
    expect(defaultPublishSlug("Project Notes.eidos")).toBe("project-notes")
    expect(defaultPublishSlug("---.eidos")).toBe("untitled")
    expect(defaultPublishSlug(`${"a".repeat(80)}.eidos`)).toHaveLength(64)
    expect(defaultPublishSlug("Release Notes.markdown")).toBe("release-notes")
  })

  it("offers Publish only for supported source files", () => {
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
      isPublishableEntry({
        name: "notes.txt",
        relativePath: "notes.txt",
        kind: "file",
        size: 1,
        modifiedAtMs: 1,
      })
    ).toBe(false)
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
