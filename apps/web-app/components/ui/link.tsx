import React from "react"

import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string
  replace?: boolean
  state?: any
  children?: React.ReactNode
}

/**
 * Custom Link component with VSCode-style tab behavior:
 * - Click: Navigate in current tab
 * - Alt/Option + Click: Open in new tab
 * - If URL already exists in a tab, activate that tab instead
 */
export function Link({
  to,
  replace,
  state,
  children,
  onClick,
  ...props
}: LinkProps) {
  const { navigate } = useRouterAdapter()

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Call custom onClick if provided
    if (onClick) {
      onClick(e)
    }

    // Check if default was prevented
    if (e.defaultPrevented) {
      return
    }

    // Handle external links normally
    if (
      to.startsWith("http://") ||
      to.startsWith("https://") ||
      to.startsWith("mailto:")
    ) {
      return // Let browser handle it
    }

    // Prevent default anchor behavior
    e.preventDefault()

    // Check if Alt/Option or Meta/Ctrl key is pressed for opening in new tab
    const target = e.altKey || e.metaKey ? "_blank" : undefined

    // Delegate to navigate with options
    // Links should open in new tabs or activate existing by default
    navigate(to, {
      replace: false,
      state,
      target,
    })
  }

  return (
    <a
      {...props}
      href={to}
      onClick={handleClick}
      title={
        props.title ||
        (props.title === undefined
          ? "Click to navigate, Alt/Cmd+Click to open in new tab"
          : props.title)
      }
    >
      {children}
    </a>
  )
}
