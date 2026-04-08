import { materializeArtifactBackedToolResult } from '../../core/artifacts/materializeArtifactBackedToolResult.ts'
import type { ToolAgentQueryArgs } from '../../core/query/createToolAgentQuery.ts'

const READ_FILE_TOOL = 'read_file'
const SEARCH_CODE_TOOL = 'search_code'
const RUN_COMMAND_TOOL = 'run_command'
const REPLACE_IN_FILE_TOOL = 'replace_in_file'

const DEFAULT_SEARCH_CODE_MAX_INLINE_CHARS = 4_000
const DEFAULT_RUN_COMMAND_MAX_INLINE_CHARS = 4_000
const DEFAULT_REPLACE_IN_FILE_MAX_INLINE_CHARS = 6_000

type ToolResultMaterializer = NonNullable<
  ToolAgentQueryArgs['materializeToolResult']
>

export function createLabToolResultMaterializer(args: {
  scopeId: string
  env?: NodeJS.ProcessEnv
}): ToolResultMaterializer {
  const thresholds = readThresholds(args.env ?? process.env)

  return async ({
    toolName,
    output,
    cwd,
    messageId,
  }): ReturnType<ToolResultMaterializer> => {
    const threshold = thresholds[toolName] ?? Infinity
    if (!Number.isFinite(threshold)) {
      return {
        messageText: output,
      }
    }

    return await materializeArtifactBackedToolResult({
      toolName,
      output,
      cwd,
      scopeId: args.scopeId,
      messageId,
      thresholdChars: threshold,
    })
  }
}

function readThresholds(
  env: NodeJS.ProcessEnv,
): Record<string, number> {
  return {
    [READ_FILE_TOOL]: Infinity,
    [SEARCH_CODE_TOOL]: readPositiveInt(
      env.LAB3_SEARCH_CODE_MAX_INLINE_CHARS,
      DEFAULT_SEARCH_CODE_MAX_INLINE_CHARS,
    ),
    [RUN_COMMAND_TOOL]: readPositiveInt(
      env.LAB3_RUN_COMMAND_MAX_INLINE_CHARS,
      DEFAULT_RUN_COMMAND_MAX_INLINE_CHARS,
    ),
    [REPLACE_IN_FILE_TOOL]: readPositiveInt(
      env.LAB3_REPLACE_IN_FILE_MAX_INLINE_CHARS,
      DEFAULT_REPLACE_IN_FILE_MAX_INLINE_CHARS,
    ),
  }
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? String(fallback))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
