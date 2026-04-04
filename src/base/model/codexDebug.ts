export interface CodexDebugEvent {
  source: 'stdout' | 'stderr'
  line: string
}

export function flushLines(
  buffer: string,
  onLine: (line: string) => void,
): string {
  let remainder = buffer

  while (true) {
    const newlineIndex = remainder.indexOf('\n')
    if (newlineIndex === -1) {
      return remainder
    }

    const line = remainder.slice(0, newlineIndex).trim()
    remainder = remainder.slice(newlineIndex + 1)

    if (!line) {
      continue
    }

    onLine(line)
  }
}

export function flushTrailingLine(
  buffer: string,
  onLine: (line: string) => void,
): void {
  const line = buffer.trim()
  if (!line) {
    return
  }

  onLine(line)
}

export function flushDebugLines(
  buffer: string,
  source: 'stdout' | 'stderr',
  onDebugEvent?: (event: CodexDebugEvent) => void,
): string {
  return flushLines(buffer, line => {
    onDebugEvent?.(buildDebugEvent(source, line))
  })
}

export function flushTrailingDebugLine(
  buffer: string,
  source: 'stdout' | 'stderr',
  onDebugEvent?: (event: CodexDebugEvent) => void,
): void {
  flushTrailingLine(buffer, line => {
    onDebugEvent?.(buildDebugEvent(source, line))
  })
}

export function buildDebugEvent(
  source: 'stdout' | 'stderr',
  line: string,
): CodexDebugEvent {
  return {
    source,
    line,
  }
}
