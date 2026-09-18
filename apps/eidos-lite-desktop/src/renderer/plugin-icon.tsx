import type { CSSProperties, ReactElement } from "react"
import {
  BarChart2,
  Blocks,
  Code2,
  Database,
  FileText,
  Layers,
  Map,
  Palette,
  Puzzle,
  Sparkles,
  Table,
} from "lucide-react"
import type { PluginManifest } from "@eidos.space/plugin-runtime/contracts"

export type PluginIconDefinition = PluginManifest["icon"]

export interface PluginTheme {
  gradient: string
  color: string
  Icon: typeof Blocks
}

export function getPluginTheme(
  id?: string,
  name?: string,
  icon?: PluginIconDefinition | null
): PluginTheme {
  const isCustomImage =
    typeof icon === "string" ||
    (icon && "src" in icon && typeof icon.src === "string")

  if (isCustomImage) {
    return {
      gradient: "var(--surface-panel)",
      color: "var(--ink)",
      Icon: Blocks,
    }
  }

  const text = `${id ?? ""} ${name ?? ""}`.toLowerCase()
  if (
    text.includes("chart") ||
    text.includes("graph") ||
    text.includes("plot") ||
    text.includes("stat")
  ) {
    return {
      gradient: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
      color: "#ffffff",
      Icon: BarChart2,
    }
  }
  if (
    text.includes("map") ||
    text.includes("geo") ||
    text.includes("location") ||
    text.includes("gis")
  ) {
    return {
      gradient: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
      color: "#ffffff",
      Icon: Map,
    }
  }
  if (
    text.includes("csv") ||
    text.includes("sheet") ||
    text.includes("table") ||
    text.includes("grid") ||
    text.includes("excel")
  ) {
    return {
      gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
      color: "#ffffff",
      Icon: Table,
    }
  }
  if (
    text.includes("kanban") ||
    text.includes("board") ||
    text.includes("task") ||
    text.includes("todo")
  ) {
    return {
      gradient: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
      color: "#ffffff",
      Icon: Layers,
    }
  }
  if (
    text.includes("doc") ||
    text.includes("text") ||
    text.includes("markdown") ||
    text.includes("note") ||
    text.includes("article")
  ) {
    return {
      gradient: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
      color: "#ffffff",
      Icon: FileText,
    }
  }
  if (
    text.includes("draw") ||
    text.includes("canvas") ||
    text.includes("paint") ||
    text.includes("design") ||
    text.includes("diagram")
  ) {
    return {
      gradient: "linear-gradient(135deg, #ec4899 0%, #be185d 100%)",
      color: "#ffffff",
      Icon: Palette,
    }
  }
  if (
    text.includes("code") ||
    text.includes("dev") ||
    text.includes("terminal") ||
    text.includes("script") ||
    text.includes("json")
  ) {
    return {
      gradient: "linear-gradient(135deg, #6366f1 0%, #4338ca 100%)",
      color: "#ffffff",
      Icon: Code2,
    }
  }
  if (
    text.includes("db") ||
    text.includes("database") ||
    text.includes("sql") ||
    text.includes("store") ||
    text.includes("sqlite")
  ) {
    return {
      gradient: "linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)",
      color: "#ffffff",
      Icon: Database,
    }
  }

  const palettes: { gradient: string; Icon: typeof Blocks }[] = [
    {
      gradient: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
      Icon: Puzzle,
    },
    {
      gradient: "linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)",
      Icon: Blocks,
    },
    {
      gradient: "linear-gradient(135deg, #f43f5e 0%, #be123c 100%)",
      Icon: Layers,
    },
    {
      gradient: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
      Icon: Sparkles,
    },
    {
      gradient: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
      Icon: Blocks,
    },
    {
      gradient: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
      Icon: Puzzle,
    },
  ]
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  const chosen = palettes[hash % palettes.length]
  return {
    gradient: chosen.gradient,
    color: "#ffffff",
    Icon: chosen.Icon,
  }
}

export function getPluginIconBadgeStyle(
  id?: string,
  name?: string,
  icon?: PluginIconDefinition | null
): CSSProperties {
  const isCustomImage =
    typeof icon === "string" ||
    (icon && "src" in icon && typeof icon.src === "string")
  if (isCustomImage) {
    return {
      background: "var(--surface-panel)",
      border: "1px solid var(--line)",
    }
  }
  const theme = getPluginTheme(id, name, icon)
  return {
    background: theme.gradient,
    color: theme.color,
    border: "1px solid rgba(255, 255, 255, 0.18)",
    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
  }
}

export interface PluginIconProps {
  icon?: PluginIconDefinition | null
  id?: string
  name?: string
  className?: string
}

export function PluginIcon({
  icon,
  id,
  name,
  className,
}: PluginIconProps): ReactElement {
  const src =
    typeof icon === "string"
      ? icon
      : icon && "src" in icon && typeof icon.src === "string"
        ? icon.src
        : null

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`plugin-icon-img ${className ?? ""}`.trim()}
        loading="lazy"
      />
    )
  }

  const paths =
    icon &&
    typeof icon === "object" &&
    "paths" in icon &&
    Array.isArray(icon.paths)
      ? icon.paths
      : null

  if (paths && paths.length > 0) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {paths.map((path, index) => (
          <path key={index} d={path} />
        ))}
      </svg>
    )
  }

  const theme = getPluginTheme(id, name, icon)
  const IconComponent = theme.Icon
  return (
    <IconComponent
      className={className}
      style={{ color: "currentColor" }}
      aria-hidden="true"
    />
  )
}
