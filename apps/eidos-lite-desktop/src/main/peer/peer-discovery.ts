import { Bonjour } from "bonjour-service"
import { networkInterfaces } from "node:os"

/** Advertisements locate an endpoint; only pinned TLS establishes device identity. */
export class PeerAdvertisement {
  private bonjour?: Bonjour
  private timer?: ReturnType<typeof setInterval>
  private interfaces = ""
  private revision?: string

  constructor(
    private readonly port: number,
    private readonly fingerprint: string,
    private readonly space: string
  ) {}

  start() {
    this.interfaces = this.networkKey()
    this.publish()
    this.timer = setInterval(() => {
      const current = this.networkKey()
      if (current === this.interfaces) return
      this.interfaces = current
      this.republish()
    }, 5000)
    this.timer.unref()
  }

  updateRevision(revision?: string | null) {
    const normalized = revision ? revision.slice(0, 8) : undefined
    if (normalized === this.revision) return
    this.revision = normalized
    if (this.bonjour) this.republish()
  }

  private republish() {
    const previous = this.bonjour
    this.bonjour = undefined
    if (previous) {
      previous.unpublishAll(() => previous.destroy())
    }
    this.publish()
  }

  private networkKey() {
    return Object.values(networkInterfaces())
      .flat()
      .filter((entry) => entry?.family === "IPv4" && !entry.internal)
      .map((entry) => entry!.address)
      .sort()
      .join(",")
  }

  private publish() {
    try {
      this.bonjour = new Bonjour(undefined, (error: Error) => {
        console.warn("LAN discovery unavailable", error.message)
      })
      const txt: Record<string, string> = {
        v: "1",
        fingerprint: this.fingerprint,
        space: this.space,
      }
      if (this.revision) txt.rev = this.revision
      const service = this.bonjour.publish({
        name: `Eidos-${this.fingerprint.slice(0, 12)}-${this.port}`,
        type: "eidos-peer",
        protocol: "tcp",
        port: this.port,
        disableIPv6: true,
        txt,
      })
      service.on("error", (error: Error) =>
        console.warn("LAN advertisement failed", error.message)
      )
    } catch (error) {
      console.warn("LAN discovery unavailable", error)
    }
  }

  close() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    this.bonjour?.unpublishAll(() => this.bonjour?.destroy())
  }
}
