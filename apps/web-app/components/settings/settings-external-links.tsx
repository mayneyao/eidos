import { Github } from "lucide-react"
import { Link } from "@/components/ui/link"
import { DiscordIcon } from "@/components/icons/discord"
import { SETTINGS_EXTERNAL_LINKS } from "./settings-events"

export const SettingsExternalLinks = () => {
  return (
    <div className="flex items-center gap-2">
      <Link to={SETTINGS_EXTERNAL_LINKS.github} target="_blank">
        <Github className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
      </Link>
      <Link to={SETTINGS_EXTERNAL_LINKS.discord} target="_blank">
        <DiscordIcon className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
      </Link>
      <Link to={SETTINGS_EXTERNAL_LINKS.website} target="_blank">
        <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          🌐
        </span>
      </Link>
    </div>
  )
}
