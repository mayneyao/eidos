import type { ComponentType, HTMLAttributes, ReactNode } from "react"

import { cn } from "@/lib/utils"

export const SETTINGS_CONTENT_BODY_CLASS_NAME = cn(
  "[&>div>div:has(>h3)]:flex [&>div>div:has(>h3)]:min-h-9 [&>div>div:has(>h3)]:items-center [&>div>div:has(>h3)]:gap-2 [&>div>div:has(>h3)]:pb-2 [&>div>div:has(>h3)]:pt-8 [&>div>div:has(>h3):first-child]:pt-0",
  "[&>div>div:has(>h3)_h3]:text-sm [&>div>div:has(>h3)_h3]:font-medium [&>div>div:has(>h3)_h3]:tracking-normal [&>div>div:has(>h3)>svg]:size-4",
  "[&>div>div:has(>div>h3)]:min-h-9 [&>div>div:has(>div>h3)]:gap-4 [&>div>div:has(>div>h3)]:pb-2 [&>div>div:has(>div>h3)]:pt-8 [&>div>div:has(>div>h3):first-child]:pt-0",
  "[&>div>div:has(>div>h3)_h3]:text-sm [&>div>div:has(>div>h3)_h3]:font-medium [&>div>div:has(>div>h3)_h3]:tracking-normal [&>div>div:has(>div>h3)>div>svg]:size-4",
  "[&>div>hr]:hidden [&>div>hr+div]:mb-8 [&>div:not([data-settings-row-groups])>hr+div]:!py-2",
  "[&>div[data-settings-row-groups]>hr+div]:overflow-hidden [&>div[data-settings-row-groups]>hr+div]:rounded-lg [&>div[data-settings-row-groups]>hr+div]:border [&>div[data-settings-row-groups]>hr+div]:border-border/80 [&>div[data-settings-row-groups]>hr+div]:bg-card/40 [&>div[data-settings-row-groups]>hr+div]:px-4 [&>div[data-settings-row-groups]>hr+div]:!py-0"
)

interface SettingsSectionHeaderProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "title"
> {
  title: ReactNode
  icon?: ComponentType<{ className?: string }>
  action?: ReactNode
}

export function SettingsSection({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section
      data-settings-section="true"
      className={cn("space-y-0", className)}
      {...props}
    />
  )
}

export function SettingsSectionHeader({
  title,
  icon: Icon,
  action,
  className,
  ...props
}: SettingsSectionHeaderProps) {
  return (
    <div
      data-settings-section-header="true"
      className={cn(
        "flex min-h-9 items-center justify-between gap-4 pb-2",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? (
          <Icon className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        <h2 className="truncate text-sm font-medium text-foreground">
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function SettingsRowSurface({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-settings-row-surface="true"
      className={cn(
        "overflow-hidden rounded-lg border border-border/80 bg-card/40 px-4",
        className
      )}
      {...props}
    />
  )
}

export function SettingsRows({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-settings-rows="true"
      className={cn("divide-y divide-border/70", className)}
      {...props}
    />
  )
}

export function SettingsRow({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-settings-row="true"
      className={cn(
        "flex min-h-[72px] flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className
      )}
      {...props}
    />
  )
}

export function SettingsRowContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-settings-row-content="true"
      className={cn("min-w-0 flex-1 space-y-0.5", className)}
      {...props}
    />
  )
}

export function SettingsRowControl({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-settings-row-control="true"
      className={cn("w-full shrink-0 sm:w-auto", className)}
      {...props}
    />
  )
}
