import { ExternalLink, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useCurrentSpace } from "@/hooks/use-current-space"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function SpaceSyncSettings() {
  const { t } = useTranslation()
  const { currentSpace: spaceInfo } = useCurrentSpace()

  const remoteAddress = spaceInfo?.sync?.remote || ""

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="remote-address">
          {t("space.settings.sync.remoteAddress")}
        </Label>
        <div className="flex gap-2">
          <Input
            id="remote-address"
            value={remoteAddress}
            readOnly
            placeholder="https://eidos.space/<username>/<space>"
            className="bg-muted flex-1"
          />
          {!remoteAddress ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                window.open("https://eidos.space/new", "_blank")
              }
              className="shrink-0"
              title={t("space.settings.sync.createSpace")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                window.open(remoteAddress, "_blank")
              }}
              className="shrink-0"
              title={t("space.settings.sync.openInWeb")}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
