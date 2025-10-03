export const meta = {
  type: "tool",
  funcName: "fetchWebContent",
  tool: {
    name: "fetchWebContent",
    description: "Fetch web content as markdown from a given URL",
    inputJSONSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the webpage to fetch content from"
        }
      },
      required: ["url"]
    },
    outputJSONSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The markdown content fetched from the URL"
        },
        success: {
          type: "boolean",
          description: "Whether the fetch operation was successful"
        },
        error: {
          type: "string",
          description: "Error message if the operation failed"
        }
      },
      required: ["content", "success"]
    }
  }
};

interface FetchResult {
  content: string;
  success: boolean;
  error?: string;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

export async function fetchWebContent(input: { url: string }): Promise<FetchResult> {
  const { url } = input;

  if (!url || typeof url !== 'string' || url.trim() === '') {
    const error = "URL is required and must be a non-empty string";
    return { content: "", success: false, error };
  }

  const normalizedUrl = normalizeUrl(url.trim());

  if (!isValidUrl(normalizedUrl)) {
    const error = `Invalid URL format: ${normalizedUrl}`;
    return { content: "", success: false, error };
  }

  try {
    const jinaUrl = `https://r.jina.ai/${normalizedUrl}`;

    const response = await fetch(jinaUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain',
        'User-Agent': 'Eidos-WebFetcher/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();

    if (!content || content.trim() === '') {
      const error = "Fetched content is empty";
      return { content: "", success: false, error };
    }

    return { content, success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullError = `Failed to fetch content from ${normalizedUrl}: ${errorMessage}`;
    return { content: "", success: false, error: fullError };
  }
}