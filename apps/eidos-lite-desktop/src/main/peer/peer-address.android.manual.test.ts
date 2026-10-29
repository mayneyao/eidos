import { it, expect } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { PeerService, renderPeerPairingCode } from "./peer-service"

const serials =
  process.env.EIDOS_348_ANDROID_SERIALS?.split(",").filter(Boolean) ?? []

function adb(serial: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("adb", ["-s", serial, ...args], { stdio: "pipe" })
    let output = ""
    child.stdout.on("data", (data: Buffer) => {
      output += data.toString()
    })
    child.stderr.on("data", (data: Buffer) => {
      output += data.toString()
    })
    child.on("error", reject)
    child.on("close", (code) =>
      code === 0 ? resolve(output) : reject(new Error(output))
    )
    child.stdin.end(input)
  })
}

it.skipIf(serials.length === 0)(
  "reproduces address rejection and verifies actual LAN pairing on Android",
  async () => {
    for (const serial of serials) {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "eidos-issue348-")
      )
      const approvals: Promise<void>[] = []
      const service = new PeerService(null, directory, (request) => {
        if (request)
          approvals.push(service.approve(true, request.id).then(() => {}))
      })
      try {
        const status = await service.start()
        let invitation = status.invitation!
        if (process.env.EIDOS_348_BAD_PRIMARY) {
          const payload = JSON.parse(
            Buffer.from(
              invitation.slice("eidos-peer:".length),
              "base64url"
            ).toString()
          ) as { url: string; urls?: string[] }
          payload.urls = [payload.url]
          if (process.env.EIDOS_348_LEGACY) delete payload.urls
          payload.url = `https://${process.env.EIDOS_348_BAD_PRIMARY}:${new URL(payload.url).port}`
          invitation =
            "eidos-peer:" +
            Buffer.from(JSON.stringify(payload)).toString("base64url")
        }
        const endpoint = JSON.parse(
          Buffer.from(
            invitation.slice("eidos-peer:".length),
            "base64url"
          ).toString()
        ) as { url: string }
        console.log(`${serial}: invitation primary ${endpoint.url}`)
        await adb(
          serial,
          [
            "shell",
            "run-as",
            "space.eidos.android.dev",
            "sh",
            "-c",
            "'cat > cache/issue348-invitation.txt'",
          ],
          invitation
        )
        const qr = await renderPeerPairingCode(invitation)
        await adb(
          serial,
          [
            "shell",
            "run-as",
            "space.eidos.android.dev",
            "sh",
            "-c",
            "'cat > cache/issue348-qr.txt'",
          ],
          qr.split(",")[1]
        )
        const output = await adb(serial, [
          "shell",
          "am",
          "instrument",
          "-w",
          "-r",
          "-e",
          "class",
          "space.eidos.android.PeerAddressReproductionTest" +
            (process.env.EIDOS_348_PAIR_ONLY
              ? "#pairsWithDesktopOnActualLan"
              : ""),
          "-e",
          "eidosTestLanguage",
          "en",
          "space.eidos.android.dev.test/space.eidos.android.EidosTestRunner",
        ])
        console.log(`${serial}:\n${output}`)
        await fs.writeFile(path.join(directory, "instrumentation.txt"), output)
        console.log(`${serial}: evidence ${directory}`)
        expect(output).toContain(
          process.env.EIDOS_348_PAIR_ONLY ? "OK (1 test)" : "OK (5 tests)"
        )
        await Promise.all(approvals)
        expect(service.status().devices).toHaveLength(1)
      } finally {
        try {
          await adb(serial, [
            "shell",
            "run-as",
            "space.eidos.android.dev",
            "rm",
            "-f",
            "cache/issue348-invitation.txt",
            "cache/issue348-qr.txt",
          ])
        } finally {
          await service.close()
          await fs.rm(path.join(directory, "peer-sync"), {
            recursive: true,
            force: true,
          })
        }
      }
    }
  },
  300_000
)
