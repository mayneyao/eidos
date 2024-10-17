import React from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { useOSDetection } from "./hooks"

export const DownloadPage: React.FC = () => {
  const detectedOS = useOSDetection()
  const getDownloadLink = (os: string) => {
    switch (os) {
      case "macOS":
        return "https://download.eidos.space/mac"
      case "Windows":
        return "https://download.eidos.space/win"
      default:
        return null
    }
  }

  const downloadLink = getDownloadLink(detectedOS)
  const isSupported = downloadLink !== null

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <img
          src="/logo.png"
          alt="Eidos Logo"
          className="w-24 h-24 mx-auto mb-6"
        />
        <h1 className="text-4xl font-bold mb-2">Download Eidos</h1>
        <p className="text-xl mb-6">
          Available for macOS, Windows, and Web app
        </p>
        {isSupported ? (
          <Link to={downloadLink}>
            <Button variant="default" size="lg">
              Download for {detectedOS}
            </Button>
          </Link>
        ) : (
          <div>
            <Button variant="default" size="lg" disabled>
              Download not available
            </Button>
            <p className="mt-2 text-sm text-gray-500">
              Your platform is not supported. Please use the Web app.
            </p>
          </div>
        )}
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Eidos Desktop</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              {
                name: "macOS (Apple Silicon)",
                icon: "apple",
                downloadLink: "https://download.eidos.space/mac",
              },
              {
                name: "Windows (x64)",
                icon: "windows",
                downloadLink: "https://download.eidos.space/win",
              },
              {
                name: "Web app",
                icon: "globe",
                downloadLink: "/",
              },
            ].map((platform) => (
              <div
                key={platform.name}
                className="flex justify-between items-center"
              >
                <div className="flex items-center space-x-2">
                  <span>{platform.name}</span>
                </div>
                <Link to={platform.downloadLink}>
                  <Button variant="outline" size="sm">
                    {platform.name === "Web app" ? "Open" : "Download"}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
