import { Bonjour } from "bonjour-service"
import { randomBytes } from "node:crypto"
import { PeerAdvertisement } from "./peer-discovery"

it("discovers the device and Space through LAN DNS-SD without publishing credentials", async () => {
  const fingerprint = randomBytes(32).toString("hex")
  const advertisement = new PeerAdvertisement(45678, fingerprint, "test-space")
  const client = new Bonjour()
  const browser = client.find({ type: "eidos-peer" })
  try {
    const found = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("No LAN advertisement received")),
        10000
      )
      browser.on("up", (service) => {
        if (service.txt?.fingerprint !== fingerprint) return
        clearTimeout(timer)
        try {
          expect(service.port).toBe(45678)
          expect(service.txt).toEqual({
            v: "1",
            fingerprint,
            space: "test-space",
          })
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })
    advertisement.start()
    await found
  } finally {
    browser.stop()
    client.destroy()
    advertisement.close()
  }
}, 15000)
