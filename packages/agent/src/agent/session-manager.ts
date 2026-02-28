import { Agent } from "@mariozechner/pi-agent-core"
import type { SpaceInfo } from "@eidos.space/space-manager"
import type {
  UserSession,
  AgentConfig,
  SpaceManagerInterface,
} from "../types/index.js"
import { SpaceFileSystem } from "../tools/space-tools.js"

/**
 * Extended user session entry with agent and filesystem
 */
interface SessionEntry {
  agent: Agent
  session: UserSession
  fileSystem?: SpaceFileSystem
}

/**
 * Agent factory function type
 */
type AgentFactory = (
  config: AgentConfig,
  spaceContext?: SpaceContext
) => Agent

/**
 * Space context for agent operations
 */
interface SpaceContext {
  space: SpaceInfo | null
  userId: string
  spaceManager: SpaceManagerInterface
}

/**
 * Core session manager - platform agnostic
 * Manages user sessions, AI agents, and space contexts
 */
export class SessionManager {
  private sessions: Map<string, SessionEntry>
  private sessionTimeout: number
  private cleanupInterval: NodeJS.Timeout
  private agentConfig: AgentConfig
  private agentFactory: AgentFactory
  private spaceManager: SpaceManagerInterface

  constructor(
    agentConfig: AgentConfig,
    spaceManager: SpaceManagerInterface,
    agentFactory: AgentFactory,
    sessionTimeoutMinutes: number = 30
  ) {
    this.sessions = new Map()
    this.sessionTimeout = sessionTimeoutMinutes * 60 * 1000
    this.agentConfig = agentConfig
    this.agentFactory = agentFactory
    this.spaceManager = spaceManager

    // Cleanup inactive sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions()
    }, 5 * 60 * 1000)
  }

  /**
   * Get or create an agent for a user
   */
  getAgent(
    userId: string,
    username?: string,
    firstName?: string
  ): Agent {
    let entry = this.sessions.get(userId)

    if (!entry) {
      // Create space context (initially null)
      const spaceContext: SpaceContext = {
        space: null,
        userId,
        spaceManager: this.spaceManager,
      }

      // Create agent with space context
      const agent = this.agentFactory(this.agentConfig, spaceContext)

      const session: UserSession = {
        userId,
        username,
        firstName,
        lastActivity: Date.now(),
        messageCount: 0,
        currentSpace: undefined,
      }

      entry = { agent, session }
      this.sessions.set(userId, entry)

      console.log(
        `📝 Created new session for user ${userId} (${username || firstName || "unknown"})`
      )
    }

    entry.session.lastActivity = Date.now()
    entry.session.messageCount++

    return entry.agent
  }

  /**
   * Get session info for a user
   */
  getSession(userId: string): UserSession | undefined {
    return this.sessions.get(userId)?.session
  }

  /**
   * Get current space for a user
   */
  getCurrentSpace(userId: string): SpaceInfo | null {
    return this.sessions.get(userId)?.session.currentSpace || null
  }

  /**
   * Switch to a specific space for a user
   * Creates a new session if one doesn't exist
   */
  switchSpace(
    userId: string,
    spaceId: string,
    userInfo?: { username?: string; firstName?: string }
  ): boolean {
    let entry = this.sessions.get(userId)

    const space = this.spaceManager.getSpace(spaceId)
    if (!space) {
      console.log(`❌ Space not found: ${spaceId}`)
      return false
    }

    // If no session exists, create one
    if (!entry) {
      const spaceContext: SpaceContext = {
        space,
        userId,
        spaceManager: this.spaceManager,
      }

      const agent = this.agentFactory(this.agentConfig, spaceContext)

      const session: UserSession = {
        userId,
        username: userInfo?.username,
        firstName: userInfo?.firstName,
        lastActivity: Date.now(),
        messageCount: 0,
        currentSpace: space,
      }

      entry = { agent, session, fileSystem: new SpaceFileSystem(space.path) }
      this.sessions.set(userId, entry)

      console.log(
        `📝 Created new session for user ${userId} with space: ${space.name}`
      )
      return true
    }

    // Update existing session
    entry.session.currentSpace = space
    entry.session.lastActivity = Date.now()

    // Update filesystem
    entry.fileSystem = new SpaceFileSystem(space.path)

    // Recreate agent with new space context
    const spaceContext: SpaceContext = {
      space,
      userId,
      spaceManager: this.spaceManager,
    }
    entry.agent = this.agentFactory(this.agentConfig, spaceContext)

    console.log(
      `🔄 User ${userId} switched to space: ${space.name} (${spaceId})`
    )
    return true
  }

  /**
   * Get filesystem for current space
   */
  getFileSystem(userId: string): SpaceFileSystem | null {
    const entry = this.sessions.get(userId)
    if (!entry?.session.currentSpace) {
      return null
    }

    // Lazy initialize filesystem
    if (!entry.fileSystem) {
      entry.fileSystem = new SpaceFileSystem(entry.session.currentSpace.path)
    }

    return entry.fileSystem
  }

  /**
   * Reset a user's conversation
   */
  resetSession(userId: string): boolean {
    const entry = this.sessions.get(userId)
    if (!entry) {
      return false
    }

    entry.agent.reset()
    entry.session.lastActivity = Date.now()
    entry.session.messageCount = 0

    console.log(`🔄 Reset session for user ${userId}`)
    return true
  }

  /**
   * Delete a user's session
   */
  deleteSession(userId: string): boolean {
    const deleted = this.sessions.delete(userId)
    if (deleted) {
      console.log(`🗑️ Deleted session for user ${userId}`)
    }
    return deleted
  }

  /**
   * Get session info for a user
   */
  getSessionInfo(userId: string): UserSession | undefined {
    return this.sessions.get(userId)?.session
  }

  /**
   * Get total number of active sessions
   */
  getActiveSessionCount(): number {
    return this.sessions.size
  }

  /**
   * Cleanup inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const now = Date.now()
    let cleanedCount = 0

    for (const [userId, entry] of this.sessions.entries()) {
      const inactiveTime = now - entry.session.lastActivity
      if (inactiveTime > this.sessionTimeout) {
        this.sessions.delete(userId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} inactive session(s)`)
    }
  }

  /**
   * Stop the session manager and cleanup
   */
  destroy(): void {
    clearInterval(this.cleanupInterval)
    this.sessions.clear()
    console.log("🛑 Session manager stopped")
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): UserSession[] {
    return Array.from(this.sessions.values()).map((entry) => entry.session)
  }
}
