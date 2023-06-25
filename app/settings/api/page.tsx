import { Separator } from "@/components/ui/separator"

export default function APISettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">API</h3>
        <p className="text-sm text-muted-foreground">
          Configure the API settings.
        </p>
      </div>
      <Separator />
    </div>
  )
}
