import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { randomBytes, randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import type { RequestListener } from "node:http"
import { createEidosFile } from "@eidos.space/eidos-file/node-sqlite"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { PeerService } from "./peer-service"

const platform = process.env.EIDOS_AUTO_PLATFORM
const repository = path.resolve("../..")
const android = "space.eidos.android.dev"
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function scheduledMobileJob(dump: string) {
  const line = dump
    .split("\n")
    .find(
      (line) =>
        line.trimStart().startsWith("JOB ") &&
        line.includes(
          android + "/androidx.work.impl.background.systemjob.SystemJobService"
        )
    )
  const match = line?.trim().match(/^JOB (?:([^ :]+):)?[^/ ]+\/(\d+):/)
  if (!match)
    throw new Error("WorkManager's real SystemJobService was not scheduled")
  return { namespace: match[1], id: match[2]! }
}

async function command(
  program: string,
  args: string[],
  input?: string,
  log?: string
) {
  if (log) await fs.writeFile(log, "")
  return new Promise<string>((resolve, reject) => {
    const child = spawn(program, args, { cwd: repository, stdio: "pipe" })
    let output = ""
    let writes = Promise.resolve()
    const collect = (data: Buffer) => {
      output += data.toString()
      if (log) writes = writes.then(() => fs.appendFile(log, data))
    }
    child.stdout.on("data", collect)
    child.stderr.on("data", collect)
    child.on("error", reject)
    child.on("close", (code) => {
      void writes
        .then(() =>
          code === 0 ? resolve(output) : reject(new Error(output.slice(-8000)))
        )
        .catch(reject)
    })
    child.stdin.end(input)
  })
}

it.skipIf(platform !== "ios" && platform !== "android")(
  "pulls desktop commits through the actual mobile coordinator and tests cancellation/edit races",
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), `eidos-auto-${platform}-`)
    )
    const root = path.join(directory, "desktop")
    await fs.mkdir(path.join(root, "assets"), { recursive: true })
    await fs.writeFile(path.join(root, "note.md"), "baseline")
    await fs.writeFile(
      path.join(root, "assets", "sample.bin"),
      randomBytes(256 * 1024)
    )
    const database = createEidosFile(path.join(root, "data.eidos"), {
      title: "Automatic pull E2E",
    })
    database.createTable({
      name: "notes",
      fields: [{ name: "title", type: "text" }],
    })
    await database.close()
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const session = await SpaceSession.create(
      root,
      path.join(directory, "state"),
      { graft }
    )
    await session.enableVersioning()
    const approvals: Promise<unknown>[] = []
    const peer = new PeerService(
      session,
      path.join(directory, "state"),
      (request) => {
        if (request) approvals.push(peer.approve(true, request.id))
      }
    )
    const controlToken = randomBytes(32).toString("base64url")
    const requests: { method: string; path: string }[] = []
    let gate: "updates" | "graft" | null = null
    let entered = false
    let downloads = 0
    let release: (() => void) | undefined
    let restoreClock: (() => Promise<void>) | undefined
    let controlQueue = Promise.resolve<unknown>(undefined)
    const state = async () => ({
      entered,
      head: (await graft.status(root)).currentHead,
      note: await fs.readFile(path.join(root, "note.md"), "utf8"),
      manualSyncs: requests.filter((request) => request.path === "/sync")
        .length,
      updates: requests.filter((request) => request.path === "/updates").length,
    })
    async function control(body: {
      action?: string
      label?: string
      gate?: "updates" | "graft"
    }) {
      if (body.action === "release") {
        release?.()
        release = undefined
        gate = null
        return {}
      }
      if (body.action === "status") return state()
      if (body.action === "downloaded") {
        downloads++
        return state()
      }
      if (body.action === "arm") {
        entered = false
        gate = body.gate ?? "graft"
        return {}
      }
      if (body.action === "advance") {
        if (!body.label || !/^[a-z0-9-]+$/.test(body.label))
          throw new Error("Invalid fixture label")
        await fs.writeFile(path.join(root, "note.md"), body.label)
        await fs.writeFile(
          path.join(root, "assets", "sample.bin"),
          randomBytes(256 * 1024)
        )
        await session.createCheckpoint(`desktop ${body.label}`)
        return state()
      }
      throw new Error("Unknown fixture action")
    }
    const iosFixture = "/tmp/eidos-ios-auto-fixture.json"
    try {
      const invitation = (await peer.start()).invitation!
      // Keep the real service's request tracking and cancellation/error handling.
      const handle = peer["tls"]!.listeners("request")[0] as RequestListener
      peer["tls"]!.removeAllListeners("request")
      peer["tls"]!.on("request", (request, response) => {
        const route = request.url ?? ""
        requests.push({ method: request.method ?? "", path: route })
        if (route === "/auto-fixture") {
          void (async () => {
            if (request.headers.authorization !== `Bearer ${controlToken}`) {
              response.writeHead(401)
              response.end()
              return
            }
            let raw = ""
            for await (const chunk of request) {
              raw += String(chunk)
              if (raw.length > 4096)
                throw new Error("Fixture request too large")
            }
            const body = JSON.parse(raw || "{}") as Parameters<
              typeof control
            >[0]
            const execute = () => control(body)
            // Status and release must bypass a stalled data request.
            const task =
              body.action === "status" || body.action === "release"
                ? execute()
                : controlQueue.then(execute)
            controlQueue = task.catch(() => {})
            response.writeHead(200, { "Content-Type": "application/json" })
            response.end(JSON.stringify(await task))
          })().catch((error: unknown) => {
            response.writeHead(500)
            response.end(JSON.stringify({ error: String(error) }))
          })
          return
        }
        const stop =
          gate === "updates"
            ? route === "/updates"
            : gate === "graft" &&
              request.method === "GET" &&
              route.startsWith("/peer/space/")
        if (stop && !entered) {
          entered = true
          let timeout: ReturnType<typeof setTimeout>
          const pending = new Promise<void>((resolve) => {
            release = resolve
            timeout = setTimeout(resolve, 25_000)
            response.once("close", resolve)
          })
          void pending.then(() => {
            clearTimeout(timeout)
            if (!response.destroyed) return handle(request, response)
          })
        } else void handle(request, response)
      })
      const fixture = JSON.stringify({
        invitation,
        controlToken,
        run: randomUUID(),
      })
      if (platform === "ios") {
        const simulator = process.env.EIDOS_AUTO_IOS_SIMULATOR
        if (!simulator)
          throw new Error(
            "Set EIDOS_AUTO_IOS_SIMULATOR to an isolated simulator"
          )
        await fs.writeFile(iosFixture, fixture, { mode: 0o600 })
        const output = await command(
          "xcodebuild",
          [
            "-project",
            "apps/eidos-ios/EidosIOS.xcodeproj",
            "-scheme",
            "EidosIOS",
            "-destination",
            `platform=iOS Simulator,id=${simulator}`,
            "-derivedDataPath",
            "apps/eidos-ios/build/DerivedData",
            "-parallel-testing-enabled",
            "NO",
            "-collect-test-diagnostics",
            "never",
            "-only-testing:EidosIOSTests/PeerAutoSyncEndToEndTests",
            "test",
          ],
          undefined,
          path.join(directory, "ios-tests.log")
        )
        await fs.writeFile(path.join(directory, "ios-tests.log"), output)
        expect(output).toContain("** TEST SUCCEEDED **")
        await fs.copyFile(
          "/tmp/eidos-ios-auto-result.json",
          path.join(directory, "ios-result.json")
        )
      } else {
        const serial = process.env.EIDOS_AUTO_ANDROID_SERIAL
        if (!serial?.startsWith("emulator-"))
          throw new Error(
            "Use an isolated emulator for the scripted lock/PIN checks"
          )
        const adbPath = path.join(
          process.env.ANDROID_HOME ??
            path.join(os.homedir(), "Library/Android/sdk"),
          "platform-tools/adb"
        )
        const adb = (args: string[], input?: string) =>
          command(adbPath, ["-s", serial, ...args], input)
        async function unlock() {
          if (
            !/deviceLocked=(?:true|1)/.test(
              await adb(["shell", "dumpsys", "trust"])
            )
          )
            return
          await adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"])
          await wait(500)
          await adb([
            "shell",
            "input",
            "swipe",
            "540",
            "1800",
            "540",
            "400",
            "300",
          ])
          await wait(500)
          await adb(["shell", "input", "text", "1846"])
          await adb(["shell", "input", "keyevent", "KEYCODE_ENTER"])
          for (let i = 0; i < 50; i++) {
            if (
              !/deviceLocked=(?:true|1)/.test(
                await adb(["shell", "dumpsys", "trust"])
              )
            )
              return
            await wait(100)
          }
          throw new Error(
            "The isolated emulator did not unlock with the fixture PIN"
          )
        }
        await unlock()
        const instrument = (method: string) =>
          adb([
            "shell",
            "am",
            "instrument",
            "-w",
            "-r",
            "-e",
            "class",
            `space.eidos.android.PeerAutoSyncEndToEndTest#${method}`,
            `${android}.test/space.eidos.android.EidosTestRunner`,
          ])
        await adb(["shell", "run-as", android, "mkdir", "-p", "cache"])
        await adb(
          [
            "shell",
            "run-as",
            android,
            "sh",
            "-c",
            "'cat > cache/auto-fixture.json'",
          ],
          fixture
        )
        const output = await instrument(
          "nativeScenariosAndPrepareBackgroundWorker"
        )
        await fs.writeFile(path.join(directory, "android-tests.log"), output)
        expect(output).toContain("OK (1 test)")
        const local = JSON.parse(
          await adb([
            "shell",
            "run-as",
            android,
            "cat",
            "cache/auto-local.json",
          ])
        ) as { id: string }
        const jobs = await adb(["shell", "dumpsys", "jobscheduler"])
        await fs.writeFile(path.join(directory, "jobs-before.txt"), jobs)
        let job = scheduledMobileJob(jobs)
        const forcedJobs: {
          id: string
          namespace?: string
          response: string
        }[] = []
        const tolerateReplacedJob = (error: unknown) => {
          if (
            error instanceof Error &&
            error.message.includes("Could not find job")
          )
            return (
              "Job replaced during WorkManager reconciliation: " + error.message
            )
          throw error
        }
        const forceJob = async () => {
          const response = await adb([
            "shell",
            "cmd",
            "jobscheduler",
            "run",
            "-f",
            ...(job.namespace ? ["-n", job.namespace] : []),
            android,
            job.id,
          ]).catch(tolerateReplacedJob)
          forcedJobs.push({ ...job, response })
        }
        try {
          await adb(["shell", "locksettings", "set-pin", "1846"])
        } catch {
          await adb([
            "shell",
            "locksettings",
            "set-pin",
            "--old",
            "1846",
            "1846",
          ])
        }
        await adb(["shell", "input", "keyevent", "KEYCODE_SLEEP"])
        await adb(["shell", "am", "kill", android])
        const coldPid = (
          await adb(["shell", "sh", "-c", `'pidof ${android} || true'`])
        ).trim()
        expect(coldPid).toBe("")
        let locked = ""
        for (let i = 0; i < 50; i++) {
          locked = await adb(["shell", "dumpsys", "trust"])
          if (/deviceLocked=(?:true|1)/.test(locked)) break
          await wait(100)
        }
        expect(locked).toMatch(/deviceLocked=(?:true|1)/)
        await fs.writeFile(path.join(directory, "locked-state.txt"), locked)
        const advanced = await control({
          action: "advance",
          label: "locked-background",
        })
        await adb(
          [
            "shell",
            "run-as",
            android,
            "sh",
            "-c",
            "'cat > cache/auto-background.json'",
          ],
          JSON.stringify(advanced)
        )
        // Advance only this disposable emulator: WorkerWrapper independently
        // checks a periodic WorkSpec's wall-clock deadline even with run -f.
        const autoTime = (
          await adb(["shell", "settings", "get", "global", "auto_time"])
        ).trim()
        const deviceTime =
          Number((await adb(["shell", "date", "+%s"])).trim()) * 1000
        const hostTime = Date.now()
        expect(Number.isFinite(deviceTime)).toBe(true)
        restoreClock = async () => {
          await adb([
            "shell",
            "cmd",
            "alarm",
            "set-time",
            String(deviceTime + Date.now() - hostTime),
          ])
          await adb([
            "shell",
            "settings",
            "put",
            "global",
            "auto_time",
            autoTime,
          ])
        }
        await adb(["shell", "settings", "put", "global", "auto_time", "0"])
        const dueTime = deviceTime + 16 * 60_000
        await adb(["shell", "cmd", "alarm", "set-time", String(dueTime)])
        const actualTime =
          Number((await adb(["shell", "date", "+%s"])).trim()) * 1000
        expect(Math.abs(actualTime - dueTime)).toBeLessThan(5_000)
        await fs.writeFile(
          path.join(directory, "emulator-clock.json"),
          JSON.stringify(
            {
              deviceTime,
              dueTime,
              actualTime,
              autoTime,
              adjustmentMinutes: 16,
              scope:
                "disposable Android emulator only; periodic deadline advanced; JobScheduler forced",
            },
            null,
            2
          )
        )
        await forceJob()
        const deadline = Date.now() + 45_000
        let received = ""
        let completed = false
        while (Date.now() < deadline) {
          received = (
            await adb([
              "shell",
              "run-as",
              android,
              "cat",
              `files/spaces/${local.id}/note.md`,
            ])
          ).trim()
          const workerLog = await adb([
            "logcat",
            "-d",
            "-v",
            "threadtime",
            "-s",
            "WM-WorkerWrapper:I",
          ])
          const pid = (
            await adb(["shell", "sh", "-c", `'pidof ${android} || true'`])
          ).trim()
          // Cold initialization may replace the forced JobInfo while WorkManager
          // reconciles the instrumentation exit. Re-trigger only a waiting job;
          // never stop an active transfer to make this test pass.
          if (pid && forcedJobs.length === 1) {
            const recovery = await adb([
              "logcat",
              "-d",
              "--pid=" + pid,
              "-s",
              "WM-ForceStopRunnable:D",
            ])
            const state = await adb([
              "shell",
              "cmd",
              "jobscheduler",
              "get-job-state",
              ...(job.namespace ? ["-n", job.namespace] : []),
              android,
              job.id,
            ]).catch(tolerateReplacedJob)
            if (
              recovery.includes("rescheduling.") &&
              state.includes("waiting") &&
              !state.includes("active")
            ) {
              job = scheduledMobileJob(
                await adb(["shell", "dumpsys", "jobscheduler"])
              )
              await forceJob()
            }
          }
          if (
            received === "locked-background" &&
            pid &&
            workerLog
              .split("\n")
              .some(
                (line) =>
                  line.includes(` ${pid} `) &&
                  /Worker result SUCCESS.*PeerAutoSyncWorker/.test(line)
              )
          ) {
            completed = true
            break
          }
          await wait(250)
        }
        expect(received).toBe("locked-background")
        expect(completed).toBe(true)
        expect(await adb(["shell", "dumpsys", "trust"])).toMatch(
          /deviceLocked=(?:true|1)/
        )
        const awakenedPid = (await adb(["shell", "pidof", android])).trim()
        expect(awakenedPid).toMatch(/^\d+/)
        await fs.writeFile(
          path.join(directory, "background-worker.log"),
          await adb(["logcat", "-d", "-s", "WM-WorkerWrapper:I"])
        )
        await fs.writeFile(
          path.join(directory, "process-wakeup.json"),
          JSON.stringify(
            {
              before: coldPid,
              after: awakenedPid,
              forcedJobs,
              screenLocked: true,
            },
            null,
            2
          )
        )
        await fs.writeFile(
          path.join(directory, "jobs-after.txt"),
          await adb(["shell", "dumpsys", "jobscheduler"])
        )
        await restoreClock()
        restoreClock = undefined
        await unlock()
        const verified = await instrument(
          "verifyBackgroundAndDirtyWorkerProtection"
        )
        await fs.writeFile(
          path.join(directory, "android-worker-tests.log"),
          verified
        )
        expect(verified).toContain("OK (1 test)")
        await fs.writeFile(
          path.join(directory, "android-result.json"),
          await adb([
            "shell",
            "run-as",
            android,
            "cat",
            "cache/auto-result.json",
          ])
        )
      }
      await Promise.all(approvals)
      await fs.writeFile(
        path.join(directory, "requests.json"),
        JSON.stringify(requests, null, 2)
      )
      // Initial download is the only manual two-way sync in these scenarios.
      expect(downloads).toBeGreaterThan(0)
      expect(
        requests.filter((request) => request.path === "/sync")
      ).toHaveLength(downloads)
      expect(
        requests.filter((request) => request.path.startsWith("/peer/incoming"))
      ).toHaveLength(0)
      console.log(`Automatic LAN E2E evidence: ${directory}`)
    } finally {
      release?.()
      await restoreClock?.()
      await fs.writeFile(
        path.join(directory, "requests.json"),
        JSON.stringify(requests, null, 2)
      )
      if (platform === "ios") await fs.rm(iosFixture, { force: true })
      const serial = process.env.EIDOS_AUTO_ANDROID_SERIAL
      if (platform === "android" && serial?.startsWith("emulator-")) {
        const adbPath = path.join(
          process.env.ANDROID_HOME ??
            path.join(os.homedir(), "Library/Android/sdk"),
          "platform-tools/adb"
        )
        await command(adbPath, [
          "-s",
          serial,
          "shell",
          "run-as",
          android,
          "rm",
          "-f",
          "cache/auto-fixture.json",
          "cache/auto-local.json",
          "cache/auto-background.json",
        ]).catch(() => {})
      }
      await peer.close()
      await session.close()
    }
  },
  900_000
)
