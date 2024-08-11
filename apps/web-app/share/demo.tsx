"use client"

import { useEffect, useState } from "react"
import type { DataConnection } from "peerjs"

import { usePeer } from "@/hooks/use-peer"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export default function Page() {
  const { peer, peerId, peers, discoverPeers } = usePeer()
  const [msg, setMsg] = useState("")
  const [to, setTo] = useState("")
  const [messages, setMessages] = useState<string[]>([])
  const [connMap, setConnMap] = useState<Record<string, DataConnection>>({})

  const appendMsg = (msg: string) => {
    setMessages((prev) => [...prev, msg])
  }

  useEffect(() => {
    peer &&
      peer.on("connection", (conn) => {
        conn.on("data", (data) => {
          appendMsg("Received:" + data)
        })
      })
  }, [peer])
  const sendMsg = () => {
    const conn = connMap[to]
    if (!conn) return
    conn.send(msg)
    appendMsg(`to:${to} msg`)
    setMsg("")
  }
  const connect = (to: string) => {
    if (!peer) return
    const conn = peer.connect(to)
    conn.on("open", () => {
      conn.send("hello!")
      setConnMap((prev) => ({ ...prev, [to]: conn }))
    })
  }

  return (
    <div>
      <div>{peerId}</div>
      all peers <Button onClick={discoverPeers}>refresh</Button>
      {peers.map((peer) => {
        const hasConn = connMap[peer]
        return (
          <div key={peer} onClick={() => connect(peer)}>
            {peer}
            {hasConn ? "✅" : "❌"}
          </div>
        )
      })}
      <div id="msg-container">
        {messages.map((msg) => (
          <div key={msg}>{msg}</div>
        ))}
      </div>
      send to:
      <Select onValueChange={setTo}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>client</SelectLabel>
            {peers
              .filter((p) => connMap[p])
              .map((peer) => {
                return <SelectItem value={peer}>{peer}</SelectItem>
              })}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Textarea value={msg} onChange={(e) => setMsg(e.target.value)}></Textarea>
      <Button onClick={sendMsg}>Send</Button>
    </div>
  )
}
