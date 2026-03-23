import { cn } from "@/lib/utils"

export const CommonMenuItem = ({ className, disabled, ...props }: any) => {
  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-xs px-2 py-1.5 text-sm outline-hidden transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "hover:bg-accent  hover:text-accent-foreground ",
        { "opacity-50": disabled },
        { "cursor-not-allowed": disabled },
        { "pointer-events-none": disabled },
        className
      )}
      {...props}
    />
  )
}
