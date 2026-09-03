import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useEffect } from "react"

function fragmentTargetId(href: string): string | null {
  if (!href.startsWith("#") || href.length === 1) return null
  const encoded = href.slice(1)
  try {
    return decodeURIComponent(encoded)
  } catch {
    return encoded
  }
}

function findTarget(root: HTMLElement, id: string): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>("[id]")) {
    if (element.id === id) return element
  }
  return null
}

export function InternalNavigationPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const origin = event.target
      if (!(origin instanceof Element)) return
      const anchor = origin.closest<HTMLAnchorElement>("a[href]")
      if (!anchor) return
      const href = anchor.getAttribute("href") ?? ""
      const targetId = fragmentTargetId(href)
      if (!targetId) return

      event.preventDefault()
      event.stopPropagation()

      const root = editor.getRootElement()
      const target = root ? findTarget(root, targetId) : null
      if (!target) return
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
        inline: "nearest",
      })
      if (!target.hasAttribute("tabindex")) target.tabIndex = -1
      target.focus({ preventScroll: true })
    }

    return editor.registerRootListener((root, previousRoot) => {
      previousRoot?.removeEventListener("click", handleClick)
      root?.addEventListener("click", handleClick)
    })
  }, [editor])

  return null
}
