import React from "react"
import {
  AlertTriangleIcon,
  CopyIcon,
  ExternalLink,
  RotateCcw,
} from "lucide-react"

import { URLS } from "@/lib/const"
import { EIDOS_VERSION } from "@/lib/env"
import { Button } from "@/components/ui/button"

interface TabErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface TabErrorBoundaryProps {
  children: React.ReactNode
  tabId?: string
}

export class TabErrorBoundary extends React.Component<
  TabErrorBoundaryProps,
  TabErrorBoundaryState
> {
  constructor(props: TabErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `Tab error boundary caught an error in tab ${this.props.tabId}:`,
      error,
      errorInfo
    )
  }

  handleRetry = () => {
    // Reset error state to retry rendering
    this.setState({ hasError: false, error: null })
  }

  handleCopyError = async () => {
    const { error } = this.state
    if (error) {
      const errorMessage = error.stack || error.message
      try {
        await navigator.clipboard.writeText(errorMessage)
        // Since we can't use toast in class component, we'll just log success
        console.log("Error message copied to clipboard")
      } catch (err) {
        console.error("Failed to copy error message:", err)
      }
    }
  }

  getGitHubIssueUrl = () => {
    const { error } = this.state
    if (!error) return ""

    const title = error.message || "Tab Error"
    const errorStack = error.stack || error.message

    // Get more accurate platform information
    const getPlatformInfo = () => {
      try {
        // In Electron renderer process, use exposed APIs
        const platform = window.eidos?.platform
        const arch = window.eidos?.arch

        if (!platform || !arch) {
          return navigator.platform
        }

        let platformName = platform
        if (platform === "darwin") {
          platformName =
            arch === "arm64" ? "macOS (Apple Silicon)" : "macOS (Intel)"
        } else if (platform === "win32") {
          platformName = `Windows (${arch})`
        } else if (platform === "linux") {
          platformName = `Linux (${arch})`
        }

        return platformName
      } catch (e) {
        // Fallback to navigator.platform if APIs are not available
        return navigator.platform
      }
    }

    const systemInfo = `### Environment
- App Version: Desktop App(${EIDOS_VERSION})
- Window Size: ${window.innerWidth}x${window.innerHeight}
- Platform: ${getPlatformInfo()}
- Architecture: ${window.eidos?.arch || "unknown"}
- Node Version: ${window.eidos?.node || "unknown"}
- Chrome Version: ${window.eidos?.chrome || "unknown"}

### Tab Error Details
\`\`\`
${errorStack}
\`\`\`

### Steps to Reproduce
1.
2.
3.

### Expected Behavior


### Actual Behavior

`

    const params = new URLSearchParams({
      title: `[Bug Report] ${title}`,
      body: systemInfo,
    })

    return `${URLS.GITHUB_ISSUES}/new?${params.toString()}`
  }

  render() {
    if (this.state.hasError) {
      const { error } = this.state

      return (
        <div className="flex h-full w-full items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
              <AlertTriangleIcon className="w-12 h-12 text-muted-foreground" />
            </div>

            <h2 className="text-2xl font-semibold mb-3">Tab Error</h2>

            <p className="text-muted-foreground mb-4">
              This tab encountered an unexpected error. Other tabs remain
              unaffected.
            </p>

            {error && (
              <p className="text-red-500 text-sm mb-6">{error.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Try again later or{" "}
              <a
                href={this.getGitHubIssueUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline inline-flex items-center gap-1"
              >
                create an issue
                <ExternalLink className="w-3 h-3" />
              </a>{" "}
              for help.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
