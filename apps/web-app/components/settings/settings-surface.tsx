import type { HTMLAttributes, ReactNode } from "react"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

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

interface SettingsSectionProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "title"
> {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  framed?: boolean
  contentClassName?: string
}

export function SettingsSection({
  title,
  description,
  actions,
  framed = true,
  children,
  className,
  contentClassName,
  ...props
}: SettingsSectionProps) {
  return (
    <section className={cn("space-y-3", className)} {...props}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-[15px] font-medium leading-6">{title}</h3>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {framed ? (
        <SettingsRowSurface className={contentClassName}>
          {children}
        </SettingsRowSurface>
      ) : (
        children
      )}
    </section>
  )
}

export function SettingsRows({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("divide-y divide-border/70", className)} {...props} />
  )
}

interface SettingsRowProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "title"
> {
  icon?: ReactNode
  title: ReactNode
  htmlFor?: string
  description?: ReactNode
  controlClassName?: string
}

export function SettingsRow({
  icon,
  title,
  htmlFor,
  description,
  children,
  className,
  controlClassName,
  ...props
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex min-h-[76px] items-center justify-between gap-6 py-4",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
        ) : null}
        <div className="space-y-0.5">
          {htmlFor ? (
            <Label htmlFor={htmlFor}>{title}</Label>
          ) : (
            <div className="text-sm font-medium leading-none">{title}</div>
          )}
          {description ? (
            <p className="text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {children ? (
        <div className={cn("shrink-0", controlClassName)}>{children}</div>
      ) : null}
    </div>
  )
}
