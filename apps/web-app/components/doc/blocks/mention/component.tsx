import { NodeMentionComponent } from "./NodeMentionComponent"
import { PropertyMentionComponent } from "./PropertyMentionComponent"

export const MentionComponent = (props: {
  id: string
  title?: string
  disablePreview?: boolean
}) => {
  const { id } = props

  // Check if this is a property reference by ID format: <nodeid>#<property>
  const isPropertyReference = id.includes("#")

  if (isPropertyReference) {
    return <PropertyMentionComponent {...props} />
  } else {
    return <NodeMentionComponent {...props} />
  }
}
