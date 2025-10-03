import { useState, useMemo } from "react"
import { Search, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { getTemplates } from "./template"

interface TemplatePanelProps {
  isCollapsed: boolean
  onTemplateSelect: (sql: string) => void
  space: string
}

export const TemplatePanel = ({
  isCollapsed,
  onTemplateSelect,
  space,
}: TemplatePanelProps) => {
  const [templateSearchQuery, setTemplateSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>("all")
  const { t } = useTranslation()

  // Get templates for the current space (memoized)
  const templates = useMemo(() => getTemplates(space), [space])

  // Template categorization and filtering logic (memoized)
  const templateCategories = useMemo(() => ({
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
  }), [templates])

  const filteredTemplates = useMemo(() => 
    templates.filter((template) => {
      const matchesSearch =
        template.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
        template.tags.some((tag) =>
          tag.toLowerCase().includes(templateSearchQuery.toLowerCase())
        ) ||
        template.i18nKey.toLowerCase().includes(templateSearchQuery.toLowerCase())

      if (selectedCategory === null || selectedCategory === "all") {
        return matchesSearch
      }

      return matchesSearch && template.category === selectedCategory
    }), [templates, templateSearchQuery, selectedCategory])

  if (isCollapsed) {
    return null
  }

  return (
    <div className="w-80 flex-shrink-0 flex flex-col h-full">
      {/* Panel header - title and search box side by side */}
      <div className="flex items-center gap-3 mb-2 flex-shrink-0 py-1">
        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {t("common.templates")}
        </label>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={templateSearchQuery}
            onChange={(e) => setTemplateSearchQuery(e.target.value)}
            className="pl-10 pr-8"
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
      </div>

      {/* Category filter */}
      <div className="flex gap-1 mb-2 flex-shrink-0 overflow-x-auto">
        {Object.entries(templateCategories).map(([key, category]) => (
          <Badge
            key={key}
            variant={selectedCategory === key ? "default" : "outline"}
            onClick={() => setSelectedCategory(key)}
            className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-muted transition-colors whitespace-nowrap flex-shrink-0"
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
          filteredTemplates.map((template) => (
            <button
              key={template.name}
              onClick={() => onTemplateSelect(template.sql.trim())}
              className="p-3 text-left border border-border rounded-lg hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="font-medium text-sm">{t(template.i18nKey)}</div>
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
  )
}
