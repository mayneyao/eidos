import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection"
import { useEditorInstance } from "@/components/doc/hooks/editor-instance-context"
import { cn } from "@/lib/utils"

interface PropertyMentionComponentProps {
  id: string
  nodeKey: string
  title?: string
}

export const PropertyMentionComponent = (
  props: PropertyMentionComponentProps
) => {
  const { docProperties } = useEditorInstance()
  const { id, nodeKey } = props
  const [isNodeSelected] = useLexicalNodeSelection(nodeKey)

  // Parse the ID to get property name: <nodeid>#<property>
  const [, propertyName] = id.split("#", 2)

  // Get property value from reactive docProperties
  const propertyValue = docProperties?.[propertyName]

  // Handle different cases for display
  const getDisplayValue = () => {
    // If no property name parsed, show error
    if (!propertyName) {
      return "Invalid property reference"
    }

    // If docProperties not loaded yet
    if (docProperties === null) {
      return "Loading..."
    }

    // If property doesn't exist
    if (!(propertyName in docProperties)) {
      return `Property "${propertyName}" not found`
    }

    // If property value is empty/null
    if (
      propertyValue === null ||
      propertyValue === undefined ||
      propertyValue === ""
    ) {
      return "Empty"
    }

    // Return the actual value
    return String(propertyValue)
  }

  const displayValue = getDisplayValue()
  const isError =
    !propertyName ||
    (docProperties !== null && !(propertyName in docProperties))

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-baseline rounded-sm px-1",
        {
          "text-red-500": isError,
          "text-blue-500": !isError,
          "ring-1 ring-ring": isNodeSelected,
          "bg-secondary": isNodeSelected,
        }
      )}
      id={id}
    >
      <span>{displayValue}</span>
    </span>
  )
}
