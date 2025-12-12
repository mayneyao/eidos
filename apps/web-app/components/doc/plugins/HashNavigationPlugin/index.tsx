import { useCallback, useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $isHeadingNode } from "@lexical/rich-text"
import { $createRangeSelection, $getRoot, $setSelection } from "lexical"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

/**
 * Plugin to handle URL hash navigation to headings
 * When URL contains a hash (e.g., #my-heading), it will automatically
 * scroll to and select the corresponding heading in the document
 */
export function HashNavigationPlugin() {
  const [editor] = useLexicalComposerContext()
  const { location } = useRouterAdapter()

  // Function to find heading by exact text match
  const findHeadingByText = useCallback(
    (searchText: string) => {
      let targetHeading = null

      editor.getEditorState().read(() => {
        const root = $getRoot()
        const children = root.getChildren()

        // Recursive function to search through all nodes
        const searchNodes = (nodes: any[]): boolean => {
          for (const node of nodes) {
            if ($isHeadingNode(node)) {
              const headingText = node.getTextContent()

              // Direct text match (case-insensitive and trim whitespace)
              const normalizedHeadingText = headingText.trim().toLowerCase()
              const normalizedSearchText = searchText.trim().toLowerCase()

              if (normalizedHeadingText === normalizedSearchText) {
                targetHeading = node
                return true
              }
            }

            // Search nested children (only if the node has getChildren method)
            if (typeof node.getChildren === "function") {
              const nestedChildren = node.getChildren()
              if (nestedChildren.length > 0 && searchNodes(nestedChildren)) {
                return true
              }
            }
          }
          return false
        }

        searchNodes(children)
      })

      return targetHeading
    },
    [editor]
  )

  // Function to scroll to heading and select it
  const scrollToHeading = useCallback(
    (headingNode: any) => {
      if (!headingNode) return

      editor.update(() => {
        // Create a range selection at the heading
        const selection = $createRangeSelection()
        selection.anchor.set(headingNode.getKey(), 0, "element")
        selection.focus.set(headingNode.getKey(), 0, "element")
        $setSelection(selection)
      })

      // Scroll to the heading element with a small delay to ensure DOM is updated
      setTimeout(() => {
        const headingElement = editor.getElementByKey(headingNode.getKey())
        if (headingElement) {
          headingElement.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
        }
      }, 100)
    },
    [editor]
  )

  // Function to handle hash change
  const handleHashChange = useCallback(() => {
    const hash = window.location.hash.slice(1) // Remove the # symbol
    if (!hash) return

    const headingNode = findHeadingByText(hash)
    if (headingNode) {
      scrollToHeading(headingNode)
    }
  }, [findHeadingByText, scrollToHeading])

  // Listen for hash changes (both native and React Router)
  useEffect(() => {
    // Handle hash from current location
    const hash = location.hash.slice(1) // Remove the # symbol
    const decodedHash = decodeURIComponent(hash) // Decode URL encoding
    if (decodedHash) {
      const headingNode = findHeadingByText(decodedHash)
      if (headingNode) {
        scrollToHeading(headingNode)
      }
    }
  }, [location.hash, findHeadingByText, scrollToHeading])

  // Also listen for native hashchange events (for direct URL changes)
  useEffect(() => {
    const handleNativeHashChange = () => {
      const hash = window.location.hash.slice(1)
      const decodedHash = decodeURIComponent(hash) // Decode URL encoding
      if (decodedHash) {
        const headingNode = findHeadingByText(decodedHash)
        if (headingNode) {
          scrollToHeading(headingNode)
        }
      }
    }

    window.addEventListener("hashchange", handleNativeHashChange)
    return () => {
      window.removeEventListener("hashchange", handleNativeHashChange)
    }
  }, [findHeadingByText, scrollToHeading])

  return null
}
