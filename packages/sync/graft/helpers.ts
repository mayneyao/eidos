// No changes to remote Log 74ggdmAVtx-3CLG4igbxFLAr

export interface GraftPushResult {
  rawMessage?: string
}

export interface GraftNewResult {
  volumeId?: string
  localLog?: string
  remoteLog?: string
  rawMessage?: string
}

/**
 * Parse graft_new command response into structured data
 */
export function parseGraftNew(data: any): GraftNewResult | null {
  if (Array.isArray(data) && data.length > 0) {
    const message = Object.keys(data[0])[0]
    const volumeMatch = message.match(/Volume ([a-zA-Z0-9_-]+)/)
    const localLogMatch = message.match(/local Log ([a-zA-Z0-9_-]+)/)
    const remoteLogMatch = message.match(/remote Log ([a-zA-Z0-9_-]+)/)

    return {
      volumeId: volumeMatch ? volumeMatch[1] : undefined,
      localLog: localLogMatch ? localLogMatch[1] : undefined,
      remoteLog: remoteLogMatch ? remoteLogMatch[1] : undefined,
      rawMessage: message,
    }
  }
  return null
}

/**
 *
 * Example output of graft_status:
On tag main
Local Log 74ggdkaEty-3ceZy5bybqxtK is grafted to
remote Log 74ggdkaEty-3hwck1nEBsyvG.

The Volume is ahead of the remote by 30 commits.
  (use 'pragma graft_push' to push changes)
 */

export interface GraftStatus {
  currentBranch?: string
  localLogId?: string
  remoteLogId?: string
  status?: "ahead" | "behind" | "up_to_date" | "diverged"
  commitDiff?: number
  ahead?: number
  behind?: number
  suggestedAction?: string
  isGrafted?: boolean
}

/**
 * Parse graft_status command output into structured data
 */
export function parseGraftStatus(data: any): GraftStatus {
  let output = ""
  if (typeof data === "string") {
    output = data
  } else if (Array.isArray(data) && data.length > 0) {
    output = data.map((row) => Object.keys(row)[0]).join("\n")
  }

  const lines = output
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const status: GraftStatus = {
    isGrafted: false,
  }

  for (const line of lines) {
    // Parse current branch/tag
    if (line.startsWith("On tag ") || line.startsWith("On branch ")) {
      status.currentBranch = line.replace(/^(On tag |On branch )/, "")
    }

    // Parse local log ID
    else if (line.includes("Local Log ") && line.includes(" is grafted to")) {
      const match = line.match(/Local Log ([a-zA-Z0-9_-]+)/)
      if (match) {
        status.localLogId = match[1]
        status.isGrafted = true
      }
    }

    // Parse remote log ID
    else if (line.includes("remote Log ")) {
      const match = line.match(/remote Log ([a-zA-Z0-9_-]+)/)
      if (match) {
        status.remoteLogId = match[1]
      }
    }

    // Parse ahead/behind status
    else if (line.includes("The Volume is ahead of the remote by")) {
      const match = line.match(/ahead of the remote by (\d+) commit(?:s)?/)
      if (match) {
        status.status = "ahead"
        status.commitDiff = parseInt(match[1], 10)
        status.ahead = status.commitDiff
        status.behind = 0
      }
    } else if (line.includes("The Volume is behind the remote by")) {
      const match = line.match(/behind the remote by (\d+) commit(?:s)?/)
      if (match) {
        status.status = "behind"
        status.commitDiff = parseInt(match[1], 10)
        status.behind = parseInt(match[1], 10)
        status.ahead = 0
      }
    } else if (line.includes("The Volume is up to date")) {
      status.status = "up_to_date"
      status.commitDiff = 0
      status.ahead = 0
      status.behind = 0
    } else if (
      line.includes("The Volume has diverged") ||
      line.includes("The Volume and the remote have diverged")
    ) {
      status.status = "diverged"
      // For diverged state, we might have additional info about ahead/behind
      const aheadMatch = line.match(/ahead by (\d+)/)
      const behindMatch = line.match(/behind by (\d+)/)
      if (aheadMatch && behindMatch) {
        status.ahead = parseInt(aheadMatch[1], 10)
        status.behind = parseInt(behindMatch[1], 10)
        status.commitDiff = status.ahead - status.behind
      }
    } else if (
      line.includes("and have") &&
      line.includes("different commits each")
    ) {
      const match = line.match(
        /and have (\d+) and (\d+) different commits each/
      )
      if (match) {
        status.ahead = parseInt(match[1], 10)
        status.behind = parseInt(match[2], 10)
        status.commitDiff = status.ahead - status.behind
      }
    }

    // Parse suggested action
    else if (
      line.includes("use 'pragma graft_push'") ||
      line.includes("use 'pragma graft_pull'")
    ) {
      if (line.includes("graft_push")) {
        status.suggestedAction = "push"
      } else if (line.includes("graft_pull")) {
        status.suggestedAction = "pull"
      }
    }
  }

  return status
}

export interface GraftTag {
  name: string
  volumeId?: string
  local?: string
  remote?: string
  status?: string
  isCurrent: boolean
}

/**
 * Parse graft_tags command output into structured data
 */
export function parseGraftTags(data: any): GraftTag[] {
  let output = ""
  if (typeof data === "string") {
    output = data
  } else if (Array.isArray(data) && data.length > 0) {
    output = data.map((row) => Object.keys(row)[0]).join("\n")
  }

  if (!output) return []

  const tags: GraftTag[] = []
  const blocks = output.split(/(?=Tag: )/)

  for (const block of blocks) {
    const lines = block
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lines.length === 0 || !lines[0].startsWith("Tag: ")) continue

    const tagLine = lines[0]
    // Tag: production (current)
    const name = tagLine.replace("Tag: ", "").split(" ")[0]
    const isCurrent = tagLine.includes("(current)")

    const tag: GraftTag = {
      name,
      isCurrent,
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith("Volume: ")) {
        tag.volumeId = line.replace("Volume: ", "")
      } else if (line.startsWith("Local: ")) {
        tag.local = line.replace("Local: ", "")
      } else if (line.startsWith("Remote: ")) {
        tag.remote = line.replace("Remote: ", "")
      } else if (line.startsWith("Status: ")) {
        tag.status = line.replace("Status: ", "")
      }
    }

    tags.push(tag)
  }

  return tags
}

export interface GraftVolume {
  id: string
  local?: string
  remote?: string
  status?: string
  isCurrent: boolean
}

/**
 * Parse graft_volumes command output into structured data
 */
export function parseGraftVolumes(data: any): GraftVolume[] {
  let output = ""
  if (typeof data === "string") {
    output = data
  } else if (Array.isArray(data) && data.length > 0) {
    output = data.map((row) => Object.keys(row)[0]).join("\n")
  }

  if (!output) return []

  const volumes: GraftVolume[] = []
  const blocks = output.split(/(?=Volume: )/)

  for (const block of blocks) {
    const lines = block
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lines.length === 0 || !lines[0].startsWith("Volume: ")) continue

    const volumeLine = lines[0]
    // Volume: 5rMJoCAF8Z-3Jcy4pdExJq5i (current)
    const id = volumeLine.replace("Volume: ", "").split(" ")[0]
    const isCurrent = volumeLine.includes("(current)")

    const volume: GraftVolume = {
      id,
      isCurrent,
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith("Local: ")) {
        volume.local = line.replace("Local: ", "")
      } else if (line.startsWith("Remote: ")) {
        volume.remote = line.replace("Remote: ", "")
      } else if (line.startsWith("Status: ")) {
        volume.status = line.replace("Status: ", "")
      }
    }

    volumes.push(volume)
  }

  return volumes
}

export interface GraftInfo {
  volumeId?: string
  localLog?: string
  remoteLog?: string
  lastSync?: string
  snapshot?: string
  snapshotPages?: number
  snapshotSize?: string
  rawMessage?: string
}

/**
 * Parse graft_info command output into structured data
 */
export function parseGraftInfo(data: any): GraftInfo | null {
  let output = ""
  if (typeof data === "string") {
    output = data
  } else if (Array.isArray(data) && data.length > 0) {
    output = data.map((row) => Object.keys(row)[0]).join("\n")
  }

  if (!output) return null

  const info: GraftInfo = {
    rawMessage: output,
  }

  const lines = output
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    if (line.startsWith("Volume: ")) {
      info.volumeId = line.replace("Volume: ", "").trim()
    } else if (line.startsWith("Local: ")) {
      info.localLog = line.replace("Local: ", "").trim()
    } else if (line.startsWith("Remote: ")) {
      info.remoteLog = line.replace("Remote: ", "").trim()
    } else if (line.startsWith("Last sync: ")) {
      info.lastSync = line.replace("Last sync: ", "").trim()
    } else if (line.startsWith("Snapshot: ")) {
      info.snapshot = line.replace("Snapshot: ", "").trim()
    } else if (line.startsWith("Snapshot pages: ")) {
      info.snapshotPages = parseInt(
        line.replace("Snapshot pages: ", "").trim(),
        10
      )
    } else if (line.startsWith("Snapshot size: ")) {
      info.snapshotSize = line.replace("Snapshot size: ", "").trim()
    }
  }

  return info
}
