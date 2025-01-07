"use client"

import { Link, useLocation } from "react-router-dom"
import { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: {
    href: string
    title: string
    disabled?: boolean
    icon?: LucideIcon
  }[]
}

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
  const location = useLocation()
  const pathname = location.pathname

  return (
    <nav
      className={cn(
        "flex space-x-2 overflow-auto lg:flex-col lg:space-x-0 lg:space-y-1",
        className
      )}
      {...props}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          to={item.href}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            pathname === item.href
              ? "bg-muted hover:bg-muted"
              : "hover:bg-transparent",
            "justify-start whitespace-nowrap",
            {
              "cursor-not-allowed": item.disabled,
              "pointer-events-none": item.disabled,
              "opacity-50": item.disabled,
            }
          )}
        >
          {item.icon && (
            <item.icon className="mr-2 h-4 w-4" />
          )}
          {item.title}
        </Link>
      ))}
    </nav>
  )
}
