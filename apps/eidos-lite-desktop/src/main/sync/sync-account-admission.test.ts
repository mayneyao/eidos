import { SyncAccountAdmission } from "./sync-account-admission"

describe("Sync account admission", () => {
  it("revokes existing operations and refuses new ones throughout local draining", () => {
    const admission = new SyncAccountAdmission()
    const existing = admission.capture()
    const change = admission.beginChange()
    expect(existing).toThrow("The Sync account changed")
    expect(() => admission.capture()).toThrow("The Sync account changed")
    change.finish()
    expect(existing).toThrow("The Sync account changed")
    expect(admission.capture()).not.toThrow()
  })

  it("does not reopen admission when an older overlapping transition completes", () => {
    const admission = new SyncAccountAdmission()
    const oldChange = admission.beginChange()
    const newChange = admission.beginChange()
    expect(oldChange.assertCurrent).toThrow("The Sync account changed")
    oldChange.finish()
    oldChange.finish()
    expect(newChange.assertCurrent).not.toThrow()
    expect(() => admission.capture()).toThrow("The Sync account changed")
    newChange.finish()
    expect(admission.capture()).not.toThrow()
  })
})
