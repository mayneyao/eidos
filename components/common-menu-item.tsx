import { cn } from "@/lib/utils"

export const CommonMenuItem = ({ className, ...props }: any) => {
  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "pl-8 hover:bg-accent  hover:text-accent-foreground ",
        className
      )}
      {...props}
    />
  )
}
