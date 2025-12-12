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

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
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

    const title = error.message || "Unexpected error"
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

### Error Details
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
        <div className="flex h-screen w-screen items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
              <AlertTriangleIcon className="w-12 h-12 text-muted-foreground" />
            </div>

            <h2 className="text-2xl font-semibold mb-3">
              Something went wrong
            </h2>

            <p className="text-muted-foreground mb-4">
              The application encountered an unexpected error.
            </p>

            {error && (
              <p className="text-red-500 text-sm mb-6">{error.message}</p>
            )}

            <div className="flex gap-2 justify-center mb-6">
              <Button onClick={this.handleReload} size="sm">
                <RotateCcw className="w-4 h-4 mr-2" />
                Reload App
              </Button>
            </div>

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
