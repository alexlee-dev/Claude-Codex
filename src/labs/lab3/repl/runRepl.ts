import { randomUUID } from 'node:crypto'
import { createLabRepl } from '../../../core/repl/createLabRepl.ts'
import { runLabStartupCommand } from '../../runLabStartupCommand.ts'
import { serializeToolTranscript as serializeTranscript } from '../../../core/model/serializeToolTranscript.ts'
import { query } from '../query.ts'
import { createLabToolResultMaterializer } from '../toolResultArtifacts.ts'

export async function runRepl(): Promise<void> {
  const artifactScopeId = `lab3-${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const startup = await runLabStartupCommand({
    labNumber: 3,
  })
  if (startup.handled && startup.result.type === 'exit') {
    return
  }

  await createLabRepl({
    labNumber: 3,
    systemPrompt:
      process.env.CODEX_SYSTEM_PROMPT ??
    [
      'You are Claude-Coded, a minimal repository coding agent running inside a local agent framework.',
      'You may either answer directly or use one tool at a time.',
      'Use read_file and search_code to inspect the repo before editing.',
      'Use replace_in_file for exact text replacements and run_command only for approved verification commands.',
      'Return only one JSON object and nothing else.',
      'For a direct answer, return {"type":"final","text":"..."}',
      'For a tool call, return {"type":"tool_call","tool":"read_file","input":{"path":"src/main.ts"}}',
      'For run_command, only use {"command":"bun","args":["test"]} or {"command":"cat","args":["relative/path"]}.',
      'For replace_in_file, use the smallest unique old_string that still identifies the target.',
      'Never invent tool outputs. After receiving a <tool> message, decide the next step.',
      'Keep answers concise and grounded in the repository.',
    ].join('\n'),
    query,
    mockEnvVar: 'LAB3_MOCK_RESPONSES',
    maxStepsEnvVar: 'LAB3_MAX_STEPS',
    bannerMode: 'repo agent · edit + verify tools',
    serializeTranscript,
    defaultMaxSteps: 6,
    createQueryOptions({ tools, cwd, maxSteps, requestToolApproval }) {
      return {
        tools,
        cwd,
        maxSteps,
        requestToolApproval,
        materializeToolResult: createLabToolResultMaterializer({
          scopeId: artifactScopeId,
        }),
      }
    },
  })
}

await runRepl()
