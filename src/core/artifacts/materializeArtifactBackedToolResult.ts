import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import type { MessageArtifact } from '../../base/types/message.ts'

const TOOL_RESULTS_ROOT = '.claude-codex/tool-results'
const MAX_PREVIEW_CHARS = 1_200
const MIN_PREVIEW_CHARS = 200

export async function materializeArtifactBackedToolResult(args: {
  toolName: string
  output: string
  cwd: string
  scopeId: string
  messageId: string
  thresholdChars: number
}): Promise<{
  messageText: string
  artifact?: MessageArtifact
}> {
  if (args.output.length <= args.thresholdChars) {
    return { messageText: args.output }
  }

  const artifactAbsolutePath = join(
    args.cwd,
    TOOL_RESULTS_ROOT,
    args.scopeId,
    `${args.messageId}.txt`,
  )

  try {
    await mkdir(dirname(artifactAbsolutePath), { recursive: true })
    await writeFile(artifactAbsolutePath, args.output, 'utf8')
  } catch {
    return { messageText: args.output }
  }

  const relativePath = relative(args.cwd, artifactAbsolutePath) || '.'
  const byteLength = Buffer.byteLength(args.output, 'utf8')

  return {
    messageText: buildArtifactPreview({
      output: args.output,
      relativePath,
      byteLength,
      thresholdChars: args.thresholdChars,
    }),
    artifact: {
      kind: 'tool_result',
      relativePath,
      byteLength,
    },
  }
}

function buildArtifactPreview(args: {
  output: string
  relativePath: string
  byteLength: number
  thresholdChars: number
}): string {
  const previewChars = Math.min(
    MAX_PREVIEW_CHARS,
    Math.max(MIN_PREVIEW_CHARS, Math.floor(args.thresholdChars / 2)),
  )
  const preview = truncatePreview(args.output, previewChars)

  return [
    preview,
    '[full tool result stored separately]',
    `path: ${args.relativePath}`,
    `bytes: ${args.byteLength}`,
    'Use read_file on this path if you need the full output.',
  ].join('\n\n')
}

function truncatePreview(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }

  return `${text.slice(0, maxChars)}\n...[preview truncated]`
}
