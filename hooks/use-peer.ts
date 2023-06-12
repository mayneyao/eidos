import { useCallback, useEffect } from "react"
import type { DataConnection, Peer } from "peerjs"
import { create } from "zustand"

import {
  ECollaborationMsgType,
  ICollaborator,
  IMsg,
} from "@/lib/collaboration/interface"
import { getWorker } from "@/lib/sqlite/sql-worker"

interface PeerState {
  peer: Peer | undefined
  peerId: string | undefined
  peers: string[]
  connectMap: Record<string, DataConnection>

  collaboratorMap: Record<string, ICollaborator>
  currentCollaborators: ICollaborator[]
  addCollaborator: (collaborator: ICollaborator) => void
  removeCollaborator: (collaborator: ICollaborator) => void

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

  collaboratorMap: {},
  currentCollaborators: [],
  addCollaborator: (collaborator) => {
    set((state) => ({
      collaboratorMap: {
        ...state.collaboratorMap,
        [collaborator.id]: collaborator,
      },
      currentCollaborators: [...state.currentCollaborators, collaborator],
    }))
  },
  removeCollaborator: (collaborator) => {
    set((state) => {
      const { [collaborator.id]: _, ...rest } = state.collaboratorMap
      return {
        collaboratorMap: rest,
        currentCollaborators: state.currentCollaborators.filter(
          (c) => c.id !== collaborator.id
        ),
      }
    })
  },

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

const serverConfig = {
  host: "localhost",
  port: 9000,
  path: "/myapp",
}

export const usePeerConnect = (connectId: string | null, name?: string) => {
  const { connectMap, removeConnect, addConnect } = usePeerStore()
  const { peer, peerId } = usePeer()

  const conn = connectId ? connectMap[connectId] : null

  const sendMsg = useCallback(
    (msg: IMsg) => {
      conn?.send(msg)
    },
    [conn]
  )
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
        conn.send({
          type: "JOIN",
          payload: { collaborator: { id: peerId, name: name ?? peerId } },
        })
        return new Promise((resolve) => {
          resolve(conn)
        })
      })
    },
    [addConnect, name, peer, removeConnect]
  )

  useEffect(() => {
    if (peerId && connectId && !conn) {
      connect(connectId)
    }
  }, [conn, connect, connectId, peerId])

  return { sendMsg, isConnected: !!conn, conn }
}

export const usePeer = () => {
  const {
    peer,
    peerId,
    peers,
    setPeer,
    setPeerId,
    setPeers,
    addCollaborator,
    removeCollaborator,
    currentCollaborators,
  } = usePeerStore()

  const handleMsg = useCallback(
    (msg: IMsg, conn: DataConnection) => {
      switch (msg.type) {
        case "JOIN":
          console.log("JOIN", msg.payload.collaborator)
          addCollaborator(msg.payload.collaborator)
          break
        case "LEAVE":
          console.log("LEAVE", msg.payload.collaborator)
          removeCollaborator(msg.payload.collaborator)
          break
        case "MOVE_CURSOR":
          console.log("MOVE_CURSOR", msg.payload)
          break
        case "QUERY":
          const worker = getWorker()
          worker.postMessage(msg.payload)
          worker.onmessage = (e) => {
            // console.log("QUERY RESULT", e.data)
            conn.send({
              type: ECollaborationMsgType.QUERY_RESP,
              payload: e.data,
            })
          }
          console.log("QUERY", msg.payload)
          break
        default:
          console.log("Unknown message type", msg)
          break
      }
    },
    [addCollaborator, removeCollaborator]
  )

  const initPeer = useCallback(async () => {
    /**
     * https://github.com/peers/peerjs/issues/819
     * nextjs build fails if we import peerjs at the top level
     */
    const OriginPeer = (await import("peerjs")).default
    const peer = new OriginPeer()
    peer.on("open", (id) => setPeerId(id))
    peer.on("connection", (conn) => {
      conn.on("data", (data) => {
        handleMsg(data as IMsg, conn)
      })
    })
    setPeer(peer)
  }, [handleMsg, setPeer, setPeerId])

  const discoverPeers = () => {
    peer?.listAllPeers((peers: string[]) => {
      console.log(peers)
      setPeers(peers)
    })
  }

  return {
    peer,
    peerId,
    peers,
    discoverPeers,
    setPeer,
    setPeerId,
    initPeer,
    currentCollaborators,
  }
}
