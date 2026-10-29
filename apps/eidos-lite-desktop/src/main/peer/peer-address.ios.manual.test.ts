import { it, expect } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { PeerService, renderPeerPairingCode } from "./peer-service"

it.skipIf(!process.env.EIDOS_348_IOS_SIMULATOR)(
  "pairs iOS through verified LAN candidates",
  async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-ios348-"))
    const fixture = "/tmp/eidos-ios348-fixture.json"
    const approvals: Promise<unknown>[] = []
    const service = new PeerService(null, directory, (request) => {
      if (request) approvals.push(service.approve(true, request.id))
    })
    try {
      const status = await service.start()
      const invitation = status.invitation!
      await fs.writeFile(
        fixture,
        JSON.stringify({
          invitation,
          qr: await renderPeerPairingCode(invitation),
        }),
        { mode: 0o600 }
      )
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(
          "xcodebuild",
          [
            "-project",
            "apps/eidos-ios/EidosIOS.xcodeproj",
            "-scheme",
            "EidosIOS",
            "-destination",
            `platform=iOS Simulator,id=${process.env.EIDOS_348_IOS_SIMULATOR}`,
            "-derivedDataPath",
            "apps/eidos-ios/build/DerivedData",
            "-parallel-testing-enabled",
            "NO",
            "-only-testing:EidosIOSTests/PeerInvitationTests",
            "-only-testing:EidosIOSTests/PeerScannerTests",
            "-only-testing:EidosIOSTests/PeerRaceTests",
            "-only-testing:EidosIOSTests/PeerDiscoveryTests",
            "-only-testing:EidosIOSTests/PeerLifecycleTests",
            "test",
          ],
          { cwd: path.resolve("../.."), stdio: "pipe" }
        )
        let output = ""
        child.stdout.on("data", (data) => {
          output += data.toString()
        })
        child.stderr.on("data", (data) => {
          output += data.toString()
        })
        child.on("error", reject)
        child.on("close", async (code) => {
          await fs.writeFile("/tmp/eidos-ios348-green.log", output)
          code === 0 ? resolve(output) : reject(new Error(output.slice(-6000)))
        })
      })
      expect(output).toContain("** TEST SUCCEEDED **")
      await Promise.all(approvals)
      expect(service.status().devices).toHaveLength(1)
    } finally {
      await fs.rm(fixture, { force: true })
      await service.close()
      await fs.rm(path.join(directory, "peer-sync"), {
        recursive: true,
        force: true,
      })
    }
  },
  600_000
)
