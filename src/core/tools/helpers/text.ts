export const DEFAULT_MAX_TEXT_CHARS = 12_000
export const DEFAULT_MAX_LINE_COUNT = 80

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }

  return `${text.slice(0, maxChars)}\n...[truncated]`
}

export function truncateLines(text: string, maxLines: number): string {
  const lines = text.split('\n')
  if (lines.length <= maxLines) {
    return text
  }

  return `${lines.slice(0, maxLines).join('\n')}\n...[truncated]`
}

export function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') {
    return 0
  }

  return haystack.split(needle).length - 1
}
