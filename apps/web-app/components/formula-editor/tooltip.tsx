/**
 * Creates a custom tooltip component for UDF code
 * @param code The UDF code to extract documentation from
 * @returns A DOM element containing the formatted documentation
 */
export function createUdfTooltip(code: string): HTMLElement {
  const element = document.createElement("div")
  element.className = "udf-tooltip"

  // Extract JSDoc comments from the code
  const jsDocRegex = /\/\*\*\s*([\s\S]*?)\s*\*\//g
  const jsDocMatches = [...code.matchAll(jsDocRegex)]

  if (jsDocMatches.length > 0) {
    // Process JSDoc comments to create formatted documentation
    const jsDocContent = jsDocMatches
      .map((match) => {
        // Clean up the JSDoc comment
        return match[1]
          .split("\n")
          .map((line) => line.trim().replace(/^\*\s*/, ""))
          .filter((line) => line)
          .join("\n")
      })
      .join("\n\n")

    // Create documentation element
    const docElement = document.createElement("div")
    docElement.className = "jsdoc-content"
    docElement.style.padding = "12px"
    docElement.style.maxWidth = "500px"
    docElement.style.maxHeight = "300px"
    docElement.style.overflow = "auto"
    docElement.style.fontSize = "0.875rem"
    docElement.style.lineHeight = "1.5"

    // Format parameter and return descriptions
    const formattedContent = jsDocContent
      .replace(
        /@param\s+\{([^}]+)\}\s+(\w+)(\s+|$)/g,
        "<strong>$2</strong> <code>$1</code>: "
      )
      .replace(
        /@returns?\s+\{([^}]+)\}/g,
        "<strong>Returns</strong> <code>$1</code>: "
      )
      .replace(/@example/g, "<strong>Example:</strong>")

    docElement.innerHTML = formattedContent
    element.appendChild(docElement)
  } else {
    // If no JSDoc is found, show a simple message
    const noDocElement = document.createElement("div")
    noDocElement.textContent = "No documentation available for this function."
    noDocElement.style.padding = "12px"
    noDocElement.style.color = "#6b7280"
    noDocElement.style.fontStyle = "italic"
    element.appendChild(noDocElement)
  }

  return element
}
