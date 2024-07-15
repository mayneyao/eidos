import { Link, useRouteError } from "react-router-dom"

import { DOMAINS } from "@/lib/const"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/components/ui/use-toast"

export function ErrorBoundary() {
  let error = useRouteError()
  console.error(error)
  const { toast } = useToast()

  const handleCopyErrorMessages = () => {
    const messages = String((error as any).stack || error)
    if (messages) {
      navigator.clipboard.writeText(messages)
      toast({
        title: "Error messages copied",
      })
    }
  }

  const isStoragePermissionError =
    error instanceof DOMException &&
    error.message.includes(
      "not allowed by the user agent or the platform in the current context"
    )

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Toaster />
      <div className="flex flex-col  items-center gap-2">
        <h1 className=" text-lg font-bold">Oops! Something went wrong 🤯</h1>
        {isStoragePermissionError ? (
          <>
            <p>
              The browser blocked the permission request. Please check the
              browser settings and allow the permission.{" "}
            </p>
            <p>
              <Link to="/settings/storage">
                <Button size="xs"> Granting the permission</Button> again will
                fix the issue.
              </Link>
            </p>
          </>
        ) : (
          <p>
            <Link to="/settings/storage">
              <Button size="xs"> Granting the permission</Button> again may fix
              the issue.
            </Link>
          </p>
        )}

        <p>
          Please try again later. If the problem persists, please join our{" "}
          <Link
            to={DOMAINS.DISCORD_INVITE}
            target="_blank"
            className="text-blue-500"
          >
            discord
          </Link>{" "}
          for help. Provide the{" "}
          <Button size="xs" variant="outline" onClick={handleCopyErrorMessages}>
            error message
          </Button>{" "}
          for better assistance.
        </p>
      </div>
    </div>
  )
}
