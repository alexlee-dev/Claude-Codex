import { createLabRepl } from '../../../core/repl/createLabRepl.ts'
import { runLabStartupCommand } from '../../runLabStartupCommand.ts'
import { serializeToolTranscript as serializeTranscript } from '../../../core/model/serializeToolTranscript.ts'
import { query } from '../query.ts'

export async function runRepl(): Promise<void> {
  const startup = await runLabStartupCommand({
    labNumber: 2,
  })
  if (startup.handled && startup.result.type === 'exit') {
    return
  }

  await createLabRepl({
    labNumber: 2,
    systemPrompt:
      process.env.CODEX_SYSTEM_PROMPT ??
    [
      'You are Claude-Coded, a minimal repository assistant running inside a local agent framework.',
      'You may either answer directly or use one tool at a time.',
      'Use tools when the user asks about repository structure, file contents, or code search.',
      'Return only one JSON object and nothing else.',
      'For a direct answer, return {"type":"final","text":"..."}',
      'For a tool call, return {"type":"tool_call","tool":"read_file","input":{"path":"src/main.ts"}}',
      'Never invent tool outputs. After receiving a <tool> message, decide the next step.',
      'Keep answers concise and grounded in the repository.',
    ].join('\n'),
    query,
    mockEnvVar: 'LAB2_MOCK_RESPONSES',
    maxStepsEnvVar: 'LAB2_MAX_STEPS',
    bannerMode: 'repo agent · read-only tools',
    serializeTranscript,
    defaultMaxSteps: 4,
    createQueryOptions({ tools, cwd, maxSteps, requestToolApproval }) {
      return { tools, cwd, maxSteps, requestToolApproval }
    },
  })
}

await runRepl()
