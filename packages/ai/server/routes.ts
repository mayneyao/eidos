import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { rgPath } from "@vscode/ripgrep"
import { Hono } from "hono"
import { AgentSessionStore } from "@/packages/core/agent-session/agent-session-store"

const execFileAsync = promisify(execFile)

function getRgBinPath(): string {
  // In Electron production, binary may be in app.asar — use unpacked copy
  if (rgPath.includes("app.asar")) {
    const unpackedPath = rgPath.replace("app.asar", "app.asar.unpacked")
    if (fs.existsSync(unpackedPath)) return unpackedPath
  }
  return rgPath
}
import type { DataSpace } from "@/packages/core/data-space"
import type { AIFormValues } from "../config"
import { extractSpace } from "./utils"
import { handleAgentApi, type IAgentData } from "./agent-api"
import { initSkillToolkit, getSkillMetas } from "./skills"

export function createAgentMiddleware(options: {
  getDataspace: (space: string) => Promise<DataSpace | null>
  getAIConfig?: () => AIFormValues | undefined
  logger?: {
    info: (...args: any[]) => void
    warn: (...args: any[]) => void
    error: (...args: any[]) => void
  }
}) {
  const app = new Hono()
  const log = options.logger ?? console

  const handleGetRequest = async (c: any) => {
    const space = extractSpace(c)
    const id = c.req.param("id") || c.req.query("id")

    if (!space) {
      return c.json({ error: "space is required" }, 400)
    }

    const dataspace = await options.getDataspace(space)
    if (!dataspace) {
      return c.json({ error: "space not found" }, 404)
    }

    const store = new AgentSessionStore(dataspace)

    if (id) {
      const session = await store.load(id)
      if (!session) {
        return c.json({ id, messages: [] })
      }
      return c.json(session)
    }

    const sessions = await store.listMeta()
    return c.json(sessions)
  }

  const handlePostRequest = async (c: any) => {
    const space = extractSpace(c)
    const data = (await c.req.json()) as IAgentData

    // Fallback if data doesn't provide space
    if (!data.space && space) {
      data.space = space
    }

    log.info("[agent-route] POST /api/agent/sessions", {
      id: data.id,
      space: data.space,
      model: data.model,
    })

    try {
      const result = await handleAgentApi(data, {
        ...options,
        signal: c.req.raw.signal,
      })
      log.info("[agent-route] ▶ response ready", { id: data.id })
      return result
    } catch (err) {
      log.error("[agent-route] ✖ error", {
        id: data.id,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      })
      throw err
    }
  }

  const handleDeleteRequest = async (c: any) => {
    const space = extractSpace(c)
    const id = c.req.param("id") || c.req.query("id")

    if (!space || !id) {
      return c.json({ error: "space and id are required" }, 400)
    }

    const dataspace = await options.getDataspace(space)
    if (!dataspace) {
      return c.json({ error: "space not found" }, 404)
    }

    const store = new AgentSessionStore(dataspace)
    await store.delete(id)
    return c.json({ success: true })
  }

  const handleSaveRequest = async (c: any) => {
    const space = extractSpace(c)
    const id = c.req.param("id") || c.req.query("id")
    const body = await c.req.json()

    if (!space || !id) {
      return c.json({ error: "space and id are required" }, 400)
    }

    const dataspace = await options.getDataspace(space)
    if (!dataspace) {
      return c.json({ error: "space not found" }, 404)
    }

    const store = new AgentSessionStore(dataspace)
    const existing = await store.loadMeta(id)

    await store.saveMeta(id, {
      id,
      goal: existing?.goal ?? body.goal ?? "",
      model: body.model ?? existing?.model ?? "",
      space: space ?? "",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
      maxSteps: body.maxSteps ?? 10,
      parentId: existing?.parentId,
      forkedMessageId: existing?.forkedMessageId,
    })

    if (body.messages) {
      await store.saveMessages(id, body.messages)
    }

    return c.json({ success: true })
  }

  // List available skills from ~/.agents/skills/
  app.get("/api/agent/skills", async (c: any) => {
    try {
      const toolkit = await initSkillToolkit()
      const skills = getSkillMetas(toolkit)
      return c.json({ skills })
    } catch (err) {
      log.error("[agent-route] ✖ skills error", err)
      return c.json({ skills: [] })
    }
  })

  // Search skills content using ripgrep
  app.get("/api/agent/skills/search", async (c: any) => {
    const q = c.req.query("q")
    if (!q) return c.json({ results: [] })

    const skillsDir = path.join(os.homedir(), ".agents", "skills")
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true })
    }
    const args = [
      "-i",
      "-n",
      "--json",
      "-g",
      "*.md",
      "--max-count",
      "50",
      q,
      skillsDir,
    ]

    try {
      const { stdout } = await execFileAsync(getRgBinPath(), args, {
        maxBuffer: 10 * 1024 * 1024,
      })

      const matches = new Map<
        string,
        {
          name: string
          dirName: string
          snippets: { content: string; line: number }[]
        }
      >()

      for (const line of stdout.split("\n")) {
        if (!line) continue
        try {
          const msg = JSON.parse(line)
          if (msg.type !== "match") continue
          const filePath = msg.data.path.text as string
          const relFromSkills = path.relative(skillsDir, filePath)
          const dirName = relFromSkills.split(path.sep)[0]
          if (!dirName || dirName === relFromSkills) continue

          if (!matches.has(dirName)) {
            matches.set(dirName, { name: dirName, dirName, snippets: [] })
          }
          const entry = matches.get(dirName)!
          if (entry.snippets.length < 3) {
            entry.snippets.push({
              content: msg.data.lines.text.trimEnd(),
              line: msg.data.line_number,
            })
          }
        } catch {
          // skip malformed JSON lines
        }
      }

      return c.json({ results: [...matches.values()] })
    } catch (error: any) {
      // ripgrep exit code 1 = no matches
      if (error.code === 1) return c.json({ results: [] })
      log.error("[agent-route] ✖ skills search error", error)
      return c.json({ results: [] })
    }
  })

  // Get full skill content by name
  app.get("/api/agent/skills/:name", async (c: any) => {
    try {
      const name = c.req.param("name")
      const toolkit = await initSkillToolkit()
      if (!toolkit) return c.json({ error: "No skills found" }, 404)
      const skill = toolkit.skills.find((s) => s.name === name)
      if (!skill) return c.json({ error: "Skill not found" }, 404)
      // Read SKILL.md from the skill directory
      const skillMdPath = path.join(skill.localPath, "SKILL.md")
      const raw = fs.readFileSync(skillMdPath, "utf-8")
      // Strip YAML frontmatter
      const instructions = raw.replace(/^---[\s\S]*?---\n?/, "").trim()
      return c.json({
        name: skill.name,
        description: skill.description,
        instructions,
        dirName: path.basename(skill.localPath),
      })
    } catch (err) {
      log.error("[agent-route] ✖ skill detail error", err)
      return c.json({ error: "Failed to load skill" }, 500)
    }
  })

  // Search agent sessions (must be before :id route)
  app.get("/api/agent/sessions/search", async (c: any) => {
    const space = extractSpace(c)
    const q = c.req.query("q")

    if (!space) return c.json({ error: "space is required" }, 400)
    if (!q) return c.json({ results: [] })

    const dataspace = await options.getDataspace(space)
    if (!dataspace) return c.json({ error: "space not found" }, 404)

    const store = new AgentSessionStore(dataspace)
    const results = await store.search(q)
    return c.json({ results })
  })

  // Handle GET requests
  app.get("/api/agent/sessions/:id?", handleGetRequest)

  // Fork a session at a specific message
  app.post("/api/agent/sessions/:id/fork", async (c: any) => {
    const space = extractSpace(c)
    const id = c.req.param("id")
    const body = await c.req.json()
    const { messageId } = body

    if (!space || !id || !messageId) {
      return c.json({ error: "space, id, and messageId are required" }, 400)
    }

    const dataspace = await options.getDataspace(space)
    if (!dataspace) {
      return c.json({ error: "space not found" }, 404)
    }

    const store = new AgentSessionStore(dataspace)
    const newId = crypto.randomUUID()

    try {
      await store.fork(id, messageId, newId)
      return c.json({ id: newId })
    } catch (err) {
      log.error("[agent-route] ✖ fork error", {
        id,
        messageId,
        error: err instanceof Error ? err.message : String(err),
      })
      return c.json(
        { error: err instanceof Error ? err.message : "Fork failed" },
        500
      )
    }
  })

  // Handle POST requests
  app.post("/api/agent/sessions/:id/save", handleSaveRequest)
  app.post("/api/agent/sessions", handlePostRequest)

  // Handle DELETE requests
  app.delete("/api/agent/sessions/:id?", handleDeleteRequest)

  return app
}
