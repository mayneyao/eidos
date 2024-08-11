import { Separator } from "@/components/ui/separator"

import { AIConfigForm } from "./ai-form"

export default function SettingsAccountPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">AI Config</h3>
        <p className="text-sm text-muted-foreground">
          Configure your AI settings.
        </p>
      </div>
      <Separator />
      <AIConfigForm />
    </div>
  )
}
