/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useCallback, useMemo, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export function useModal(): [
  JSX.Element | null,
  (title: string, showModal: (onClose: () => void) => JSX.Element) => void
] {
  const [open, setOpen] = useState(false)
  const [modalContent, setModalContent] = useState<null | {
    closeOnClickOutside: boolean
    content: JSX.Element
    title: string
  }>(null)

  const onClose = useCallback(() => {
    setModalContent(null)
  }, [])

  const onOpenChange = useCallback(
    (open: boolean) => {
      console.log("onOpenChange", open)
      if (!open) {
        onClose()
      }
    },
    [onClose]
  )

  const modal = useMemo(() => {
    if (modalContent === null) {
      return null
    }
    const { title, content, closeOnClickOutside } = modalContent
    return (
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
            </DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    )
  }, [modalContent, onOpenChange, open])

  const showModal = useCallback(
    (
      title: string,
       
      getContent: (onClose: () => void) => JSX.Element,
      closeOnClickOutside = false
    ) => {
      setOpen(true)
      setModalContent({
        closeOnClickOutside,
        content: getContent(onClose),
        title,
      })
    },
    [onClose]
  )

  return [modal, showModal]
}
