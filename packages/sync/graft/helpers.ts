
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
  suggestedAction?: string
  isGrafted?: boolean
}

/**
 * Parse graft_status command output into structured data
 */
export function parseGraftStatus(output: string): GraftStatus {
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
      const match = line.match(/Local Log ([^ ]+)/)
      if (match) {
        status.localLogId = match[1]
        status.isGrafted = true
      }
    }

    // Parse remote log ID
    else if (line.includes("remote Log ")) {
      const match = line.match(/remote Log ([^ ]+)/)
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
      }
    } else if (line.includes("The Volume is behind the remote by")) {
      const match = line.match(/behind the remote by (\d+) commit(?:s)?/)
      if (match) {
        status.status = "behind"
        status.commitDiff = parseInt(match[1], 10)
      }
    } else if (line.includes("The Volume is up to date")) {
      status.status = "up_to_date"
      status.commitDiff = 0
    } else if (line.includes("The Volume has diverged")) {
      status.status = "diverged"
      // For diverged state, we might have additional info about ahead/behind
      const aheadMatch = line.match(/ahead by (\d+)/)
      const behindMatch = line.match(/behind by (\d+)/)
      if (aheadMatch && behindMatch) {
        // Could store both ahead and behind counts if needed
        status.commitDiff =
          parseInt(aheadMatch[1], 10) - parseInt(behindMatch[1], 10)
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
