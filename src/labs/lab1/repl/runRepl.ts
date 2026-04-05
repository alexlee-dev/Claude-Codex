import { createLabRepl } from '../../../core/repl/createLabRepl.ts'
import { runLabStartupCommand } from '../../runLabStartupCommand.ts'
import { serializeTranscript } from '../model/serializeTranscript.ts'
import { query } from '../query.ts'

export async function runRepl(): Promise<void> {
  const startup = await runLabStartupCommand({
    labNumber: 1,
  })
  if (startup.handled && startup.result.type === 'exit') {
    return
  }

  await createLabRepl({
    systemPrompt:
      process.env.CODEX_SYSTEM_PROMPT ??
    [
      'You are Claude-Codex, a minimal assistant running inside a local agent framework.',
      'This lab supports multi-turn chat only.',
      'Do not run commands or use tools.',
      'Answer concisely and continue the conversation naturally.',
    ].join(' '),
    query,
    mockEnvVar: 'LAB1_MOCK_RESPONSES',
    bannerMode: 'multi-turn chat · no tools',
    serializeTranscript,
    includeToolCatalog: false,
  })
}

await runRepl()
