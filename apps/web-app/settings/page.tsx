import { Separator } from "@/components/ui/separator"
import { ProfileForm } from "@/apps/web-app/settings/profile-form"

export default function SettingsGeneralPage() {
  return (
    <div className="max-w-md space-y-6">
      <div>
        <h3 className="text-lg font-medium">General</h3>
        <p className="text-sm text-muted-foreground">
          How others will see you when collaborating.
        </p>
      </div>
      <Separator />
      <ProfileForm />
    </div>
  )
}
