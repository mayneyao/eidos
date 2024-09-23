import { Separator } from "@/components/ui/separator"

import { StorageForm } from "./storage-form"

export default function SettingsStoragePage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Storage</h3>
        <p className="text-sm text-muted-foreground">
          Configure your storage settings.
        </p>
      </div>
      <Separator />
      <StorageForm />
    </div>
  )
}
