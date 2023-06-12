import Peer, { DataConnection } from "peerjs"
import { useCallback, useEffect } from "react"
import { create } from "zustand"

interface PeerState {
  peer: Peer | undefined
  peerId: string | undefined
  peers: string[]
  connectMap: Record<string, DataConnection>

  setPeer: (peer: Peer) => void
  setPeerId: (peerId: string) => void
  setPeers: (peers: string[]) => void
  setConnectMap: (connectMap: Record<string, DataConnection>) => void
  addConnect: (peerId: string, conn: DataConnection) => void
  removeConnect: (peerId: string) => void
}

const usePeerStore = create<PeerState>()((set) => ({
  peer: undefined,
  peerId: undefined,
  peers: [],
  connectMap: {},

  setConnectMap: (connectMap) => set({ connectMap }),
  setPeer: (peer) => set({ peer }),
  setPeerId: (peerId) => set({ peerId }),
  setPeers: (peers) => set({ peers }),
  addConnect: (peerId, conn) => {
    set((state) => ({
      connectMap: { ...state.connectMap, [peerId]: conn },
    }))
  },

  removeConnect: (peerId) => {
    set((state) => {
      const { [peerId]: _, ...rest } = state.connectMap
      return { connectMap: rest }
    })
  },
}))

export const serverConfig = {
  host: "localhost",
  port: 9000,
  path: "/myapp",
}

export const usePeerConnect = (connectId: string | null) => {
  const { connectMap, removeConnect, addConnect } = usePeerStore()
  const { peer, peerId } = usePeer()

  const conn = connectId ? connectMap[connectId] : null

  const connect = useCallback(
    async (peerId: string) => {
      const conn = peer?.connect(peerId)
      conn?.on("data", (data: any) => {
        console.log("Received", data)
      })

      conn?.on("close", () => {
        removeConnect(peerId)
      })

      return conn?.on("open", () => {
        addConnect(peerId, conn)
        return new Promise((resolve) => {
          resolve(conn)
        })
      })
    },
    [addConnect, peer, removeConnect]
  )

  useEffect(() => {
    if (peerId && connectId && !conn) {
      connect(connectId)
    }
  }, [conn, connect, connectId, peerId])

  return conn
}

export const usePeer = () => {
  const { peer, peerId, peers, setPeer, setPeerId, setPeers } = usePeerStore()

  const discoverPeers = () => {
    peer?.listAllPeers((peers: string[]) => {
      console.log(peers)
      setPeers(peers)
    })
  }

  return { peer, peerId, peers, discoverPeers, setPeer, setPeerId }
}
