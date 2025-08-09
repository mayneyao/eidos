import { BasicInfo } from "./basic-info"
import { BindingsConfig } from "./bindings-config"
import { DangerZone } from "./danger-zone"

export const ExtensionConfig = () => {
  return (
    <div className="flex flex-col gap-2">
      <BasicInfo />
      <BindingsConfig />
      <DangerZone />
    </div>
  )
}
