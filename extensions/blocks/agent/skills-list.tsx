import { SparklesIcon, PlayIcon } from "lucide-react"
import React from "react"
import type { SkillSearchResult } from "@/components/ai-agent/agent-store"

const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse rounded-md bg-muted ${className || ""}`} />
)

export interface SkillMeta {
  name: string
  description: string
  dirName: string
}

interface SkillsListProps {
  skills: SkillMeta[]
  loading: boolean
  searchResults: SkillSearchResult[]
  searchLoading: boolean
  isSearching: boolean
  onSkillClick: (skill: SkillMeta) => void
  onTrySkill: (e: React.MouseEvent, skill: SkillMeta) => void
}

export function SkillsList({
  skills,
  loading,
  searchResults,
  searchLoading,
  isSearching,
  onSkillClick,
  onTrySkill,
}: SkillsListProps) {
  if (loading) {
    return (
      <div className="space-y-2 px-1">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    )
  }

  // Search results
  if (isSearching) {
    if (searchLoading) {
      return (
        <div className="space-y-2 px-1">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div key={idx} className="space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      )
    }
    if (searchResults.length === 0) {
      return (
        <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No results.
        </div>
      )
    }
    return (
      <div className="h-full w-full overflow-y-auto pr-1">
        <div className="space-y-1">
          {searchResults.map((result) => {
            const skill: SkillMeta = {
              name: result.name,
              dirName: result.dirName,
              description: "",
            }
            return (
              <div
                key={result.dirName}
                onClick={() => onSkillClick(skill)}
                className="group flex flex-col gap-1 rounded-lg border border-transparent px-3 py-2 cursor-pointer hover:bg-muted/50 transition-all duration-200"
              >
                <div className="flex items-start gap-2 overflow-hidden">
                  <div className="mt-0.5 shrink-0">
                    <SparklesIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </div>
                  <span className="text-xs font-medium truncate text-muted-foreground flex-1">
                    ${result.dirName}
                  </span>
                  <button
                    onClick={(e) => onTrySkill(e, skill)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-primary/10 hover:text-primary rounded transition-all shrink-0"
                    title="Try in Chat"
                  >
                    <PlayIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
                {result.snippets.length > 0 && (
                  <div className="pl-5.5 text-[11px] text-muted-foreground/70 line-clamp-2">
                    {result.snippets[0].content}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (skills.length === 0) {
    return (
      <div className="px-1 py-8 text-center border border-dashed rounded-lg">
        <SparklesIcon className="h-5 w-5 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">No skills found.</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          Add skills to ~/.agents/skills/
        </p>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-y-auto pr-1">
      <div className="space-y-1">
        {skills.map((skill) => (
          <div
            key={skill.dirName}
            onClick={() => onSkillClick(skill)}
            className="group flex items-start gap-2 rounded-lg border border-transparent px-3 py-2 cursor-pointer hover:bg-muted/50 transition-all duration-200"
          >
            <div className="mt-0.5 shrink-0">
              <SparklesIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-muted-foreground truncate">
                ${skill.dirName}
              </div>
              <div className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                {skill.description}
              </div>
            </div>
            <button
              onClick={(e) => onTrySkill(e, skill)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-primary/10 hover:text-primary rounded transition-all shrink-0"
              title="Try in Chat"
            >
              <PlayIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
