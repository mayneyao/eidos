import React, { useEffect } from "react"
import confetti from "canvas-confetti"

export default function () {
  useEffect(() => {
    confetti()
  }, [])

  return <div></div>
}
