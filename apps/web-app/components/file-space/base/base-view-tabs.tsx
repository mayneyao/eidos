import type { ComponentProps } from "react"
import { BaseViewTabStrip } from "@eidos.space/base-ui/base-editor-chrome"

import {
  BaseViewSelector,
  baseExtensionContributionId,
  isBaseBuiltInViewType,
} from "./base-view-selector"

type BaseViewTabsProps = ComponentProps<typeof BaseViewSelector>

export function BaseViewTabs(props: BaseViewTabsProps) {
  const { views, activeView, disabled, onSelect } = props
  const supportedViews = views.filter(
    (view) =>
      isBaseBuiltInViewType(view.type) || baseExtensionContributionId(view.type)
  )

  return (
    <BaseViewTabStrip
      views={supportedViews}
      activeViewId={activeView?.id}
      disabled={disabled}
      onSelect={onSelect}
      afterTabs={
        <>
          <BaseViewSelector
            {...props}
            viewAction={undefined}
            triggerMode="create"
          />
          <BaseViewSelector {...props} triggerMode="manage" />
        </>
      }
    />
  )
}
