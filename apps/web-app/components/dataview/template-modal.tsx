import { useState, useMemo, useEffect, useRef } from "react"
import { Search, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import { getTemplates } from "./template"

interface TemplateModalProps {
  onTemplateSelect: (sql: string) => void
  children: React.ReactNode
}

export const TemplateModal = ({
  onTemplateSelect,
  children,
}: TemplateModalProps) => {
  const [templateSearchQuery, setTemplateSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>("all")
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const { t } = useTranslation()

  const searchInputRef = useRef<HTMLInputElement>(null)
  const templateRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Get templates (memoized)
  const templates = useMemo(() => getTemplates(), [])

  // Template categorization and filtering logic (memoized)
  const templateCategories = useMemo(
    () => ({
      all: { label: "All", icon: "🔍", count: templates.length },
      doc: {
        label: "Doc",
        icon: "📄",
        count: templates.filter((t) => t.category === "doc").length,
      },
      file: {
        label: "File",
        icon: "📁",
        count: templates.filter((t) => t.category === "file").length,
      },
      system: {
        label: "System",
        icon: "⚙️",
        count: templates.filter((t) => t.category === "system").length,
      },
    }),
    [templates]
  )

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const matchesSearch =
          template.name
            .toLowerCase()
            .includes(templateSearchQuery.toLowerCase()) ||
          template.tags.some((tag) =>
            tag.toLowerCase().includes(templateSearchQuery.toLowerCase())
          ) ||
          template.i18nKey
            .toLowerCase()
            .includes(templateSearchQuery.toLowerCase())

        if (selectedCategory === null || selectedCategory === "all") {
          return matchesSearch
        }

        return matchesSearch && template.category === selectedCategory
      }),
    [templates, templateSearchQuery, selectedCategory]
  )

  const handleTemplateSelect = (templateSql: string) => {
    onTemplateSelect(templateSql)
    setIsOpen(false)
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return

      // ESC key - close modal
      if (event.key === "Escape") {
        event.preventDefault()
        setIsOpen(false)
        return
      }

      // Ctrl/Cmd + F - focus search input
      if ((event.ctrlKey || event.metaKey) && event.key === "f") {
        event.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      // Arrow keys - navigate through templates
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()

        if (filteredTemplates.length === 0) return

        const newIndex =
          event.key === "ArrowDown"
            ? Math.min(focusedIndex + 1, filteredTemplates.length - 1)
            : Math.max(focusedIndex - 1, -1)

        setFocusedIndex(newIndex)

        if (newIndex >= 0) {
          templateRefs.current[newIndex]?.focus()
        } else {
          searchInputRef.current?.focus()
        }
        return
      }

      // Enter key - select focused template
      if (event.key === "Enter" && focusedIndex >= 0) {
        event.preventDefault()
        const template = filteredTemplates[focusedIndex]
        if (template) {
          handleTemplateSelect(template.sql.trim())
        }
        return
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, focusedIndex, filteredTemplates])

  // Reset focused index when templates change
  useEffect(() => {
    setFocusedIndex(-1)
  }, [filteredTemplates])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("common.templates")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Search box */}
          <div className="relative px-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search templates... (Ctrl+F to focus)"
              value={templateSearchQuery}
              onChange={(e) => setTemplateSearchQuery(e.target.value)}
              className="pl-10 pr-8"
              onFocus={() => setFocusedIndex(-1)}
            />
            {templateSearchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTemplateSearchQuery("")}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Category filter */}
          <div className="flex gap-1 flex-wrap px-1">
            {Object.entries(templateCategories).map(([key, category]) => (
              <Badge
                key={key}
                variant={selectedCategory === key ? "default" : "outline"}
                onClick={() => setSelectedCategory(key)}
                className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-muted transition-colors whitespace-nowrap"
              >
                <span className="text-xs">{category.icon}</span>
                <span className="font-medium text-xs">{category.label}</span>
                <span className="text-xs font-semibold text-muted-foreground">
                  {category.count}
                </span>
              </Badge>
            ))}
          </div>

          {/* Template list */}
          <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0 p-1">
            {filteredTemplates.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                No templates found
              </div>
            ) : (
              filteredTemplates.map((template, index) => (
                <button
                  key={template.name}
                  ref={(el) => (templateRefs.current[index] = el)}
                  onClick={() => handleTemplateSelect(template.sql.trim())}
                  className={`p-3 text-left border border-border rounded-lg hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring transition-colors group ${
                    focusedIndex === index ? "ring-2 ring-ring bg-muted" : ""
                  }`}
                  onFocus={() => setFocusedIndex(index)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-medium text-sm">
                      {t(template.i18nKey)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={"secondary"}
                        className="text-xs px-2 py-0.5 whitespace-nowrap"
                      >
                        {template.difficulty === "beginner" ? "🟢" : "🟡"}{" "}
                        {template.difficulty}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2 line-clamp-2">
                    {t(template.descriptionKey)}
                  </div>
                  {template.tags && template.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {template.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-xs px-2 py-0.5"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
