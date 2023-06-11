import { Separator } from "@/components/ui/separator"
import { ProfileForm } from "@/app/settings/profile-form"

export default function SettingsGeneralPage() {
  return (
    <div className="max-w-md space-y-6">
      <div>
        <h3 className="text-lg font-medium">General</h3>
        <p className="text-sm text-muted-foreground">
          This is how others will see you on the site.
        </p>
      </div>
      <Separator />
      <ProfileForm />
    </div>
  )
}
