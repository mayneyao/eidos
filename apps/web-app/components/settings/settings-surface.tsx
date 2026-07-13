import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

export const SETTINGS_CONTENT_BODY_CLASS_NAME =
  "[&>div>div:has(>h3)]:pb-2 [&>div>div:has(>h3)]:pt-5 [&>div>div:has(>h3):first-child]:pt-0 [&>div>div:has(>h3)_h3]:text-[15px] [&>div>div:has(>h3)_h3]:font-medium [&>div>hr]:hidden [&>div>hr+div]:mb-7 [&>div[data-settings-row-groups]>hr+div]:overflow-hidden [&>div[data-settings-row-groups]>hr+div]:rounded-xl [&>div[data-settings-row-groups]>hr+div]:border [&>div[data-settings-row-groups]>hr+div]:border-border/80 [&>div[data-settings-row-groups]>hr+div]:bg-card/30 [&>div[data-settings-row-groups]>hr+div]:px-5 [&>div[data-settings-row-groups]>hr+div]:!py-0"

export function SettingsRowSurface({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-settings-row-surface="true"
      className={cn(
        "overflow-hidden rounded-xl border border-border/80 bg-card/30 px-5",
        className
      )}
      {...props}
    />
  )
}
