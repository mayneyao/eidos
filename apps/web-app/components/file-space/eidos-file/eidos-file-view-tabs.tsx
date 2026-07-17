import type { ComponentProps } from "react"
import { EidosFileViewTabStrip } from "@eidos.space/eidos-file-ui/eidos-file-editor-chrome"

import {
  EidosFileViewSelector,
  eidosFileExtensionContributionId,
  isEidosFileBuiltInViewType,
} from "./eidos-file-view-selector"

type EidosFileViewTabsProps = ComponentProps<typeof EidosFileViewSelector>

export function EidosFileViewTabs(props: EidosFileViewTabsProps) {
  const { views, activeView, disabled, onSelect } = props
  const supportedViews = views.filter(
    (view) =>
      isEidosFileBuiltInViewType(view.type) ||
      eidosFileExtensionContributionId(view.type)
  )

  return (
    <EidosFileViewTabStrip
      views={supportedViews}
      activeViewId={activeView?.id}
      disabled={disabled}
      onSelect={onSelect}
      afterTabs={
        <>
          <EidosFileViewSelector
            {...props}
            viewAction={undefined}
            triggerMode="create"
          />
          <EidosFileViewSelector {...props} triggerMode="manage" />
        </>
      }
    />
  )
}
