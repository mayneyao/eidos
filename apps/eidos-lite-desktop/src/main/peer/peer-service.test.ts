import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import https from "node:https"
import net from "node:net"
import tls from "node:tls"
import { RepositorySession } from "@eidos.space/graft"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { PeerService } from "./peer-service"

describe("LAN device sync", () => {
  it("pairs explicitly, exchanges Graft history, preserves origin, and revokes access", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-peer-"))
    const root = path.join(directory, "desktop"),
      phone = path.join(directory, "phone")
    await fs.mkdir(root)
    await fs.mkdir(phone)
    await fs.writeFile(path.join(root, "note.md"), "desktop version")
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const session = await SpaceSession.create(
      root,
      path.join(directory, "state"),
      { graft }
    )
    const peer = new PeerService(session, path.join(directory, "state"))
    let secondPeer: PeerService | undefined
    let secondSession: SpaceSession | undefined
    let mobile: RepositorySession | undefined
    let proxy: net.Server | undefined
    const sockets = new Set<net.Socket>()
    try {
      await session.enableVersioning()
      await graft.addRemote(
        root,
        "origin",
        "https://cloud.example.test/account/space"
      )
      const invitation = await peer.start()
      const data = JSON.parse(
        Buffer.from(
          invitation.invitation!.replace("eidos-peer:", ""),
          "base64url"
        ).toString()
      ) as { url: string; ticket: string; fingerprint: string }
      const url = new URL(data.url)
      const identity = JSON.parse(
        await fs.readFile(
          path.join(directory, "state/peer-sync", "device", "identity.json"),
          "utf8"
        )
      ) as { cert: string }
      const call = (route: string, token: string, body = {}, endpoint = url) =>
        new Promise<{ status: number; value: Record<string, string> }>(
          (resolve, reject) => {
            const request = https.request(
              new URL(route, endpoint),
              {
                method: "POST",
                ca: identity.cert,
                checkServerIdentity: () => undefined,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
              (response) => {
                let text = ""
                response.on("data", (chunk) => (text += chunk))
                response.on("end", () =>
                  resolve({
                    status: response.statusCode!,
                    value: JSON.parse(text),
                  })
                )
              }
            )
            request.on("error", reject)
            request.end(JSON.stringify(body))
          }
        )
      expect((await call("/sync", "wrong")).status).toBe(401)
      expect(
        (await call("/pair", data.ticket, { name: "Test phone" })).status
      ).toBe(202)
      expect(peer.status().pending).toBe("Test phone")
      await peer.approve(true)
      const paired = await call("/pair", data.ticket)
      expect((await call("/pair", data.ticket)).status).toBe(403)
      const token = paired.value.token
      const secondRoot = path.join(directory, "second-space")
      await fs.mkdir(secondRoot)
      secondSession = await SpaceSession.create(
        secondRoot,
        path.join(directory, "state"),
        {
          graft: new GraftClient({
            sdkTransport: new GraftInProcessTransport(),
          }),
        }
      )
      secondPeer = new PeerService(secondSession, path.join(directory, "state"))
      const secondInvitation = await secondPeer.start()
      const secondData = JSON.parse(
        Buffer.from(
          secondInvitation.invitation!.replace("eidos-peer:", ""),
          "base64url"
        ).toString()
      ) as { url: string; fingerprint: string }
      expect(secondData.fingerprint).toBe(data.fingerprint)
      expect(
        (await call("/spaces", "wrong", {}, new URL(secondData.url))).status
      ).toBe(401)
      const spaces = await call("/spaces", token, {}, new URL(secondData.url))
      expect(spaces.status).toBe(200)
      expect(spaces.value.spaces).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: session.canonical.id }),
          expect.objectContaining({ id: secondSession.canonical.id }),
        ])
      )
      expect(secondPeer.status().pending).toBeUndefined()
      await secondPeer.close()
      secondPeer = new PeerService(secondSession, path.join(directory, "state"))
      await secondPeer.start()
      expect(
        (await call("/spaces", token, {}, new URL(secondData.url))).status
      ).toBe(200)
      const prepared = await call("/sync", token)
      expect(prepared.value).toEqual({ state: "ready" })
      proxy = net.createServer((local) => {
        const remote = tls.connect(
          {
            host: url.hostname,
            port: Number(url.port),
            ca: identity.cert,
            checkServerIdentity: () => undefined,
          },
          () => {
            local.pipe(remote)
            remote.pipe(local)
          }
        )
        sockets.add(local)
        sockets.add(remote)
        local.on("error", () => remote.destroy())
        remote.on("error", () => local.destroy())
      })
      await new Promise<void>((resolve) =>
        proxy!.listen(0, "127.0.0.1", resolve)
      )
      const remoteUrl = `graft+http://127.0.0.1:${(proxy.address() as net.AddressInfo).port}/peer/space`
      mobile = await RepositorySession.open(phone)
      await mobile.init()
      await mobile.configureRemote({
        name: "eidos-peer",
        url: remoteUrl,
        bearerToken: token,
      })
      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      const plan = await mobile.planMerge({ revision: "eidos-peer/main" })
      await mobile.applyMerge({
        revision: "eidos-peer/main",
        planToken: plan.plan_token,
      })
      expect(await fs.readFile(path.join(phone, "note.md"), "utf8")).toBe(
        "desktop version"
      )
      await fs.writeFile(path.join(phone, "note.md"), "phone version")
      await mobile.addAll()
      await mobile.commit("phone edit")
      await mobile.push({ remote: "eidos-peer", branch: "main" })
      const completed = await call("/sync", token)
      expect(completed.value).toEqual({ state: "ready" })
      expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
        "phone version"
      )
      expect(await graft.remoteUrl(root, "origin")).toBe(
        "https://cloud.example.test/account/space"
      )
      expect(
        (await mobile.listRemotes()).remotes.map((remote) => remote.name)
      ).toEqual(["eidos-peer"])
      await fs.writeFile(
        path.join(root, "desktop.md"),
        "desktop independent edit"
      )
      await fs.writeFile(path.join(phone, "phone.md"), "phone independent edit")
      await mobile.addAll()
      await mobile.commit("independent phone edit")
      await mobile.push({ remote: "eidos-peer", branch: "main" })
      expect((await call("/sync", token)).value).toEqual({ state: "ready" })
      expect(await fs.readFile(path.join(root, "desktop.md"), "utf8")).toBe(
        "desktop independent edit"
      )
      expect(await fs.readFile(path.join(root, "phone.md"), "utf8")).toBe(
        "phone independent edit"
      )
      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      const merged = await mobile.planMerge({ revision: "eidos-peer/main" })
      await mobile.applyMerge({
        revision: "eidos-peer/main",
        planToken: merged.plan_token,
      })
      expect(await fs.readFile(path.join(phone, "desktop.md"), "utf8")).toBe(
        "desktop independent edit"
      )
      await fs.writeFile(path.join(root, "note.md"), "desktop concurrent edit")
      await fs.writeFile(path.join(phone, "note.md"), "phone concurrent edit")
      await mobile.addAll()
      await mobile.commit("concurrent phone edit")
      await mobile.push({ remote: "eidos-peer", branch: "main" })
      expect((await call("/sync", token)).status).toBe(409)
      expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
        "desktop concurrent edit"
      )
      expect(await fs.readFile(path.join(phone, "note.md"), "utf8")).toBe(
        "phone concurrent edit"
      )
      await peer.revoke(paired.value.deviceId)
      expect((await call("/sync", token)).status).toBe(401)
      expect(
        (await call("/spaces", token, {}, new URL(secondData.url))).status
      ).toBe(401)
    } finally {
      await mobile?.close()
      for (const socket of sockets) socket.destroy()
      if (proxy)
        await new Promise<void>((resolve) => proxy!.close(() => resolve()))
      await peer.close()
      await secondPeer?.close()
      await secondSession?.close()
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  }, 120_000)
})
