/**
 * Shared utility for fetching and extracting text content from URLs.
 * Used by both the ingest-url API and the project get-content API.
 */

/**
 * Fetches text content from a URL with a 30-second timeout.
 */
export async function fetchUrlContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DataSpecerBot/1.0; +http://example.com/bot)",
        Accept:
          "text/html,application/xhtml+xml,application/xml,application/json,*/*;q=0.9",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"))
    ) {
      throw new Error(
        "Request timeout: URL did not respond within 30 seconds"
      );
    }
    throw error;
  }
}

/**
 * Extracts readable text content from HTML.
 */
export function extractTextFromHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  const metaDescMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );
  const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : "";

  const mainMatch =
    text.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
    text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

  let bodyContent = mainMatch ? mainMatch[1] : text;
  bodyContent = bodyContent.replace(/<[^>]+>/g, " ");
  bodyContent = bodyContent
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  let result = "";
  if (title) result += `Title: ${title}\n\n`;
  if (metaDesc) result += `Description: ${metaDesc}\n\n`;
  result += bodyContent;
  return result;
}

/**
 * Checks if content appears to be HTML.
 */
function isHtml(content: string): boolean {
  return (
    content.includes("<html") ||
    content.includes("<!DOCTYPE") ||
    content.includes("<body")
  );
}

/**
 * Fetches a URL and extracts clean text content.
 * For HTML pages, extracts readable text. For other content, returns as-is.
 * Cleans control characters from the result.
 */
export async function fetchAndExtractUrlContent(url: string): Promise<string> {
  const raw = await fetchUrlContent(url);

  // If HTML, extract text; otherwise keep raw content
  let content = raw;
  if (isHtml(raw)) {
    content = extractTextFromHtml(raw);
  }

  // Clean control characters
  content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");

  return content;
}
