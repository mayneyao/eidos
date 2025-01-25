"use client"

import { LucideIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link, useLocation } from "react-router-dom"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: {
    href: string
    title: string
    disabled?: boolean
    icon?: LucideIcon
    isAlpha?: boolean
  }[]
}

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
  const location = useLocation()
  const pathname = location.pathname

  const { t } = useTranslation()
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
          {item.icon && <item.icon className="mr-2 h-4 w-4" />}
          {item.title}
          {item.isAlpha && (
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
              {t("common.badge.alpha")}
            </span>
          )}
        </Link>
      ))}
    </nav>
  )
}
