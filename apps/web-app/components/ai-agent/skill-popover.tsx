import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { cn } from "@/lib/utils"

interface SkillMeta {
  name: string
  description: string
  dirName: string
}

interface SkillPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  skills: SkillMeta[]
  onSelect: (skill: SkillMeta) => void
  filterQuery: string
  anchorRef: React.RefObject<HTMLElement | null>
  activeIndex: number
  onActiveIndexChange: (index: number) => void
}

export function SkillPopover({
  open,
  onOpenChange,
  skills,
  onSelect,
  filterQuery,
  anchorRef,
  activeIndex,
  onActiveIndexChange,
}: SkillPopoverProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })

  const filtered = useMemo(() => {
    if (!filterQuery) return skills
    const q = filterQuery.toLowerCase()
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    )
  }, [skills, filterQuery])

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPosition({
      top: rect.top - 4,
      left: rect.left,
      width: rect.width,
    })
  }, [anchorRef])

  useEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, updatePosition])

  // Close on outside click (delay attachment to avoid closing on the same event that opened)
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onOpenChange(false)
    }
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleClick)
    }
  }, [open, onOpenChange, anchorRef])

  // Scroll active item into view
  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    if (!menu) return
    const item = menu.querySelector(`[data-index="${activeIndex}"]`)
    item?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, open])

  if (!open) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-md border bg-popover shadow-md overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        transform: "translateY(-100%)",
      }}
    >
      <div className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1">
        {filtered.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No skills found.
          </div>
        )}
        {filtered.length > 0 && (
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Skills
          </div>
        )}
        {filtered.map((skill, index) => (
          <div
            key={skill.dirName}
            data-index={index}
            onClick={() => onSelect(skill)}
            onMouseEnter={() => onActiveIndexChange(index)}
            className={cn(
              "relative flex cursor-default gap-2 select-none items-center rounded-xs px-2 py-1.5 text-sm outline-hidden",
              index === activeIndex && "bg-accent text-accent-foreground"
            )}
          >
            <span className="font-medium">{skill.name}</span>
            {skill.description && (
              <span className="text-muted-foreground text-xs truncate">
                {skill.description}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
