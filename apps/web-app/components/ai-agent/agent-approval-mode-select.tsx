import { Check, Hand, ShieldAlert, ShieldCheck } from "lucide-react"

import type { FileSpaceAgentApprovalMode } from "@/apps/desktop/electron/modules/file-space-agent/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const APPROVAL_OPTIONS = [
  {
    value: "ask",
    label: "Ask for approval",
    description: "Ask before every Space change or network action.",
    icon: Hand,
  },
  {
    value: "auto-safe",
    label: "Approve for me",
    description:
      "Only ask before destructive, Extension trust, or network actions.",
    icon: ShieldCheck,
  },
  {
    value: "full-access",
    label: "Full access",
    description: "Run every typed Agent action in this Space without asking.",
    icon: ShieldAlert,
    dangerous: true,
  },
] satisfies Array<{
  value: FileSpaceAgentApprovalMode
  label: string
  description: string
  icon: typeof Hand
  dangerous?: boolean
}>

interface AgentApprovalModeSelectProps {
  value: FileSpaceAgentApprovalMode
  onValueChange: (value: FileSpaceAgentApprovalMode) => void
  disabled?: boolean
}

export function AgentApprovalModeSelect({
  value,
  onValueChange,
  disabled = false,
}: AgentApprovalModeSelectProps) {
  const selected =
    APPROVAL_OPTIONS.find((option) => option.value === value) ??
    APPROVAL_OPTIONS[0]
  const SelectedIcon = selected.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Approval mode: ${selected.label}`}
          title={
            disabled
              ? `Approval mode is locked while Agent is running: ${selected.label}`
              : `Approval mode: ${selected.label}`
          }
          className={cn(
            "flex h-7 max-w-[132px] items-center gap-1.5 rounded-md px-1.5 text-[11px] text-zinc-500 outline-none transition-colors hover:bg-zinc-200/60 hover:text-zinc-800 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            selected.dangerous &&
              "text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
          )}
        >
          <SelectedIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{selected.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[min(390px,calc(100vw-2rem))] rounded-xl p-1.5 shadow-xl"
      >
        <div className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">
          How should Agent actions be approved?
        </div>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) =>
            onValueChange(nextValue as FileSpaceAgentApprovalMode)
          }
        >
          {APPROVAL_OPTIONS.map((option) => {
            const Icon = option.icon
            const checked = option.value === value
            return (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className={cn(
                  "grid cursor-default grid-cols-[20px_minmax(0,1fr)_16px] items-start gap-2 rounded-lg px-2 py-2.5 [&>span:first-child]:hidden",
                  option.dangerous &&
                    "text-orange-600 focus:text-orange-700 dark:text-orange-400 dark:focus:text-orange-300"
                )}
              >
                <Icon className="mt-0.5 h-4 w-4" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium leading-5">
                    {option.label}
                  </span>
                  <span
                    className={cn(
                      "block text-xs font-normal leading-4 text-muted-foreground",
                      option.dangerous &&
                        "text-orange-600/80 dark:text-orange-400/80"
                    )}
                  >
                    {option.description}
                  </span>
                </span>
                {checked ? <Check className="mt-1 h-4 w-4" /> : null}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
        <div className="mx-2 mt-1 border-t pt-2 text-[11px] leading-4 text-muted-foreground">
          All modes remain limited to the current Space and its typed tools.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
