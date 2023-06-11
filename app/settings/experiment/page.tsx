import { Separator } from "@/components/ui/separator"
import { ExperimentForm } from "@/app/settings/experiment/experiment-form"

// Experiment
export default function SettingsExperimentFeaturePage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Experiment ⚗</h3>
        <p className="text-sm text-muted-foreground">
          Eidos is under active development. We are working hard to make it ✊,
          here is the list of features that are currently in development. active
          feature as you need. there are some bugs and missing features. when
          the feature is ready, we will release it and the feature will
          disappear from this page.
        </p>
      </div>
      <Separator />
      <ExperimentForm />
    </div>
  )
}
