import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  encryptedStagingSmokeRequest,
  prepareEncryptedStagingSmokeProfile,
  stagingFixtureCli,
} from "./encrypted-staging-smoke-policy"
import {
  resolveEidosLiteServiceEnvironment,
  runtimeEnvironmentOverride,
} from "../../shared/service-environment"

describe("encrypted staging package admission", () => {
  it("uses the bundled canonical fixture engine without a PATH fallback", () => {
    const resources = path.resolve("Resources")
    expect(stagingFixtureCli(true, resources, "darwin")).toBe(
      path.join(resources, "publish-engine/eidos")
    )
    expect(stagingFixtureCli(true, resources, "win32")).toBe(
      path.join(resources, "publish-engine/eidos.exe")
    )
    expect(stagingFixtureCli(false, resources, "darwin")).toBe("eidos")
  })
  it("has no side effects without an explicit request", () => {
    expect(
      encryptedStagingSmokeRequest({
        packaged: true,
        environment: "production",
        sourceSnapshot: false,
        variables: {},
      })
    ).toBeUndefined()
  })

  it("rejects production before checking even an invalid result path", () => {
    const previous = process.env.EIDOS_LITE_ENVIRONMENT
    process.env.EIDOS_LITE_ENVIRONMENT = "staging"
    try {
      const environment = resolveEidosLiteServiceEnvironment(
        runtimeEnvironmentOverride(true, "staging"),
        "production"
      )
      expect(() =>
        encryptedStagingSmokeRequest({
          packaged: true,
          environment: environment.name,
          sourceSnapshot: false,
          variables: { EIDOS_LITE_STAGING_E2EE_RESULT: "relative.json" },
        })
      ).toThrow("unavailable in production")
    } finally {
      if (previous === undefined) delete process.env.EIDOS_LITE_ENVIRONMENT
      else process.env.EIDOS_LITE_ENVIRONMENT = previous
    }
  })

  it.each([
    { EIDOS_LITE_GRAFT_SDK_PATH: "/source/sdk" },
    { GRAFT_SDK_NATIVE_PATH: "/source/addon.node" },
    { EIDOS_LITE_STAGING_UI_PROFILES: "1" },
  ])("rejects packaged overrides %j", (override) => {
    expect(() =>
      encryptedStagingSmokeRequest({
        packaged: true,
        environment: "staging",
        sourceSnapshot: false,
        variables: {
          EIDOS_LITE_STAGING_E2EE_RESULT: path.resolve("result.json"),
          ...override,
        },
      })
    ).toThrow("bundled release dependencies")
  })

  it("rejects bundled source snapshots", () => {
    expect(() =>
      encryptedStagingSmokeRequest({
        packaged: true,
        environment: "staging",
        sourceSnapshot: true,
        variables: {
          EIDOS_LITE_STAGING_E2EE_RESULT: path.resolve("result.json"),
        },
      })
    ).toThrow("bundled release dependencies")
  })

  it("rejects overlapping smoke modes", () => {
    expect(() =>
      encryptedStagingSmokeRequest({
        packaged: true,
        environment: "staging",
        sourceSnapshot: false,
        variables: {
          EIDOS_LITE_STAGING_E2EE_RESULT: path.resolve("result.json"),
          EIDOS_LITE_SMOKE_RESULT: path.resolve("other.json"),
        },
      })
    ).toThrow("only one")
  })
})

// POSIX owner-only mode validation is the contract of this Mac/Linux harness;
// Windows ACL-based acceptance needs its own credential-file implementation.
describe.skipIf(process.platform === "win32")(
  "encrypted staging profile isolation",
  () => {
    let root: string
    let credentials: string
    let evidence: string
    let normalProfile: string
    beforeEach(() => {
      root = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "staging-policy-"))
      )
      credentials = path.join(root, "account.bin")
      evidence = path.join(root, "evidence")
      normalProfile = path.join(root, "normal-profile")
      fs.mkdirSync(evidence, { mode: 0o700 })
      fs.mkdirSync(normalProfile, { mode: 0o700 })
      fs.writeFileSync(credentials, "synthetic credential", { mode: 0o600 })
    })
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
    const variables = (account: string): NodeJS.ProcessEnv => ({
      EIDOS_LITE_STAGING_ACCOUNT_STATE: account,
    })

    it("reuses only its private profile across distinct fresh-process reports", () => {
      const enrollment = path.join(evidence, "enrollment.json")
      const profile = prepareEncryptedStagingSmokeProfile(
        enrollment,
        normalProfile,
        variables(credentials)
      )
      fs.writeFileSync(enrollment, "{}", { mode: 0o600 })
      expect(
        prepareEncryptedStagingSmokeProfile(
          path.join(evidence, "restart.json"),
          normalProfile,
          {
            ...variables(credentials),
            EIDOS_LITE_STAGING_REMEMBER_ENROLLMENT: enrollment,
          }
        )
      ).toBe(profile)
      expect(profile).toBe(path.join(evidence, "app-user-data"))
      expect(fs.readdirSync(normalProfile)).toEqual([])
      expect(fs.statSync(profile).mode & 0o777).toBe(0o700)
    })

    it("will not overwrite prior evidence", () => {
      const result = path.join(evidence, "result.json")
      fs.writeFileSync(result, "existing", { mode: 0o600 })
      expect(() =>
        prepareEncryptedStagingSmokeProfile(
          result,
          normalProfile,
          variables(credentials)
        )
      ).toThrow("new result")
      expect(fs.readFileSync(result, "utf8")).toBe("existing")
    })

    it("rejects a dangling result symlink", () => {
      const result = path.join(evidence, "result.json")
      fs.symlinkSync(path.join(root, "not-created"), result)
      expect(() =>
        prepareEncryptedStagingSmokeProfile(
          result,
          normalProfile,
          variables(credentials)
        )
      ).toThrow("new result")
    })

    it("rejects evidence inside the normal application profile", () => {
      expect(() =>
        prepareEncryptedStagingSmokeProfile(
          path.join(normalProfile, "result.json"),
          normalProfile,
          variables(credentials)
        )
      ).toThrow("separate evidence")
      expect(fs.readdirSync(normalProfile)).toEqual([])
    })

    it("rejects a symlinked credential before creating a profile", () => {
      const link = path.join(root, "link.bin")
      fs.symlinkSync(credentials, link)
      expect(() =>
        prepareEncryptedStagingSmokeProfile(
          path.join(evidence, "result.json"),
          normalProfile,
          variables(link)
        )
      ).toThrow("owner-only regular file")
      expect(fs.readdirSync(evidence)).toEqual([])
    })

    it("rejects a symlinked profile", () => {
      fs.symlinkSync(normalProfile, path.join(evidence, "app-user-data"), "dir")
      expect(() =>
        prepareEncryptedStagingSmokeProfile(
          path.join(evidence, "result.json"),
          normalProfile,
          variables(credentials)
        )
      ).toThrow("owner-only regular directory")
      expect(fs.readdirSync(normalProfile)).toEqual([])
    })

    it("rejects public credentials, enrollment files, and evidence directories", () => {
      const result = path.join(evidence, "result.json")
      fs.chmodSync(credentials, 0o644)
      expect(() =>
        prepareEncryptedStagingSmokeProfile(
          result,
          normalProfile,
          variables(credentials)
        )
      ).toThrow("owner-only regular file")
      fs.chmodSync(credentials, 0o600)
      const enrollment = path.join(root, "enrollment.json")
      fs.writeFileSync(enrollment, "{}", { mode: 0o644 })
      expect(() =>
        prepareEncryptedStagingSmokeProfile(result, normalProfile, {
          ...variables(credentials),
          EIDOS_LITE_STAGING_REMEMBER_ENROLLMENT: enrollment,
        })
      ).toThrow("owner-only regular file")
      fs.chmodSync(evidence, 0o755)
      expect(() =>
        prepareEncryptedStagingSmokeProfile(
          result,
          normalProfile,
          variables(credentials)
        )
      ).toThrow("owner-only regular directory")
    })
  }
)
