export const meta = {
  type: "docAction",
  funcName: "summarizeArticle",
  docAction: {
    name: "Summarize Article",
    description: "Generates a concise summary of the document using AI",
  },
}

export async function summarizeArticle(
  input: Record<string, any>,
  ctx: {
    docId: string
  }
) {
  const { docId } = ctx

  // Get document content
  const docContent = await eidos.currentSpace.doc.getMarkdown(docId)

  if (!docContent) {
    throw new Error("Document content not found")
  }

  // Check if document is too short to summarize
  if (docContent.trim().length < 100) {
    return {
      success: true,
      summary: "Document is too short to generate a meaningful summary.",
      originalLength: docContent.length,
    }
  }

  try {
    // Generate AI summary
    const summary = await eidos.AI.generateText({
      prompt: `Please provide a concise summary of the following document in exactly 127 characters or less. IMPORTANT: Respond in the same language as the original document. Focus on the main points, key insights, and important information. Keep the summary clear and well-structured:

${docContent}`,
    })

    // Save summary to document properties
    await eidos.currentSpace.doc.setProperties(docId, {
      summary: summary,
    })

    return {
      success: true,
      summary: summary,
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate summary: ${error.message}`,
    }
  }
}
