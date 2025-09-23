import { useSearchParams } from "react-router-dom"
import { UnifiedSettings } from "@/components/settings/unified-settings"

type SettingsSection = 
  | "space-general" 
  | "space-document"
  | "general" 
  | "ai" 
  | "api" 
  | "api-key" 
  | "storage" 
  | "sync" 
  | "security"

export default function SettingsPage() {
  const [searchParams] = useSearchParams()
  const section = searchParams.get("section") as SettingsSection | null

  return (
    <UnifiedSettings 
      initialSection={section || "general"} 
      showSpaceSettings={false} 
    />
  )
}
