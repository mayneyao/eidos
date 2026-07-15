import { useCallback, useEffect, useRef, useState } from "react"

import type { FileExtensionSemanticUiRequest } from "@/apps/desktop/electron/modules/file-extensions/types"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { isDesktopMode } from "@/lib/env"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"

type BlockingSemanticRequest = Exclude<
  FileExtensionSemanticUiRequest,
  { kind: "notice" }
>

function isSemanticRequest(
  value: unknown
): value is FileExtensionSemanticUiRequest {
  if (!value || typeof value !== "object") return false
  const request = value as Partial<FileExtensionSemanticUiRequest>
  return (
    (request.kind === "notice" ||
      request.kind === "confirm" ||
      request.kind === "select") &&
    typeof request.id === "string" &&
    typeof request.spaceId === "string" &&
    typeof request.packageId === "string"
  )
}

export function ExtensionSemanticUiHost() {
  const { currentSpace } = useCurrentSpace()
  const { toast } = useToast()
  const [requests, setRequests] = useState<BlockingSemanticRequest[]>([])
  const respondingIds = useRef(new Set<string>())
  const current = requests[0]

  const respond = useCallback(
    async (
      request: BlockingSemanticRequest,
      response: { value?: boolean | string; cancelled?: boolean }
    ) => {
      if (respondingIds.current.has(request.id)) return
      respondingIds.current.add(request.id)
      setRequests((pending) => pending.filter((item) => item.id !== request.id))
      try {
        await window.eidos.fileExtensions.resolveSemanticUi(request.spaceId, {
          requestId: request.id,
          ...response,
        })
      } catch {
        // The worker may have timed out or been invalidated while UI was open.
      }
    },
    []
  )

  useEffect(() => {
    if (
      !isDesktopMode ||
      !currentSpace?.id ||
      currentSpace.mode !== "file" ||
      !window.eidos?.fileExtensions
    ) {
      return
    }
    const spaceId = currentSpace.id
    void window.eidos.fileExtensions.startWatching(spaceId)
    return () => {
      void window.eidos.fileExtensions.stopWatching(spaceId).catch(() => {
        // Main-process teardown also closes the watcher and active runtimes.
      })
    }
  }, [currentSpace?.id, currentSpace?.mode])

  useEffect(() => {
    if (!isDesktopMode || !window.eidos) return
    const listenerId = window.eidos.on(
      "file-extensions:semantic-ui",
      (_event: unknown, payload: unknown) => {
        if (!isSemanticRequest(payload)) return
        if (payload.kind === "notice") {
          toast({
            title: "Extension",
            description: payload.message,
          })
          return
        }
        setRequests((pending) =>
          pending.some((item) => item.id === payload.id)
            ? pending
            : [...pending, payload]
        )
      }
    )
    return () => {
      if (listenerId)
        window.eidos.off("file-extensions:semantic-ui", listenerId)
    }
  }, [toast])

  useEffect(() => {
    if (!isDesktopMode || !window.eidos) return
    const listenerId = window.eidos.on(
      "file-extensions:semantic-ui-cancel",
      (_event: unknown, payload: unknown) => {
        if (
          !payload ||
          typeof payload !== "object" ||
          !("requestId" in payload) ||
          typeof payload.requestId !== "string"
        ) {
          return
        }
        respondingIds.current.add(payload.requestId)
        setRequests((pending) =>
          pending.filter((item) => item.id !== payload.requestId)
        )
      }
    )
    return () => {
      if (listenerId) {
        window.eidos.off("file-extensions:semantic-ui-cancel", listenerId)
      }
    }
  }, [])

  useEffect(() => {
    if (!current || current.spaceId === currentSpace?.id) return
    void respond(current, { cancelled: true })
  }, [current, currentSpace?.id, respond])

  return (
    <>
      <AlertDialog
        open={current?.kind === "confirm"}
        onOpenChange={(open) => {
          if (!open && current?.kind === "confirm") {
            void respond(current, { value: false })
          }
        }}
      >
        {current?.kind === "confirm" ? (
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>{current.title}</AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-wrap">
                {current.message}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p className="text-xs text-muted-foreground">
              Requested by {current.packageId}
            </p>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => void respond(current, { value: false })}
              >
                {current.cancelLabel ?? "Cancel"}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void respond(current, { value: true })}
              >
                {current.confirmLabel ?? "Continue"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>

      <Dialog
        open={current?.kind === "select"}
        onOpenChange={(open) => {
          if (!open && current?.kind === "select") {
            void respond(current, { cancelled: true })
          }
        }}
      >
        {current?.kind === "select" ? (
          <DialogContent className="max-w-md gap-3">
            <DialogHeader>
              <DialogTitle>{current.title}</DialogTitle>
              <DialogDescription>
                {current.placeholder ?? `Requested by ${current.packageId}`}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-72 space-y-1 overflow-y-auto py-1">
              {current.items.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
                  onClick={() => void respond(current, { value: item.value })}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {item.label}
                    </span>
                    {item.description ? (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </Button>
              ))}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}
