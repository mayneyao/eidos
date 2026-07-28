import { EIDOS_LITE_SERVICE_ENVIRONMENTS } from "../../shared/service-environment"
import {
  defaultGraftBinaryPath,
  GraftClient,
  isOfficialRemoteUrl,
} from "./graft-client"

describe("GraftClient", () => {
  it("resolves an explicitly configured CLI without accepting repository input", () => {
    const previous = process.env.EIDOS_LITE_GRAFT_CLI_PATH
    process.env.EIDOS_LITE_GRAFT_CLI_PATH = "/opt/eidos/graft"
    try {
      expect(defaultGraftBinaryPath()).toBe("/opt/eidos/graft")
    } finally {
      if (previous === undefined) delete process.env.EIDOS_LITE_GRAFT_CLI_PATH
      else process.env.EIDOS_LITE_GRAFT_CLI_PATH = previous
    }
  })

  it("rejects non-official product remotes before spawning Graft", async () => {
    const client = new GraftClient("missing-graft")
    await expect(
      client.configureOfficialRemote(
        "/tmp/space",
        "s3://bucket/space",
        "secret"
      )
    ).rejects.toThrow("only the official")
  })

  it("allows only the selected environment's official repository origin", () => {
    const staging = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging.syncRemoteOrigin
    const production =
      EIDOS_LITE_SERVICE_ENVIRONMENTS.production.syncRemoteOrigin

    expect(
      isOfficialRemoteUrl(
        "https://sync-staging.eidos.space/u-alice/project",
        staging
      )
    ).toBe(true)
    expect(
      isOfficialRemoteUrl(
        "graft+https://sync.eidos.space/u-alice/project",
        production
      )
    ).toBe(true)
    expect(
      isOfficialRemoteUrl("https://sync.eidos.space/u-alice/project", staging)
    ).toBe(false)
    expect(
      isOfficialRemoteUrl(
        "https://token@sync-staging.eidos.space/u-alice/project",
        staging
      )
    ).toBe(false)
    expect(
      isOfficialRemoteUrl(
        "https://sync-staging.eidos.space/u-alice/project?token=secret",
        staging
      )
    ).toBe(false)
  })
})
