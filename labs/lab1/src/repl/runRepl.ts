import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { QueryEngine } from '../QueryEngine.ts'
import {
  type CodexDebugEvent,
  CodexCliModelClient,
} from '../model/CodexCliModelClient.ts'
import { InMemoryTranscript } from '../transcript/InMemoryTranscript.ts'
import { renderLab1Banner } from '../ui/clawd.ts'

export async function runRepl(): Promise<void> {
  const debug = process.env.DEBUG === '1'
  const model = process.env.CODEX_MODEL ?? 'gpt-5.4-mini'
  const reasoningEffort =
    (process.env.CODEX_REASONING_EFFORT as
      | 'low'
      | 'medium'
      | 'high'
      | 'none'
      | undefined) ?? 'low'
  const systemPrompt =
    process.env.CODEX_SYSTEM_PROMPT ??
    [
      'You are lab1, a minimal assistant running inside a local agent framework.',
      'This lab supports multi-turn chat only.',
      'Do not run commands or use tools.',
      'Answer concisely and continue the conversation naturally.',
    ].join(' ')

  const transcript = new InMemoryTranscript()
  const engine = new QueryEngine({
    transcript,
    modelClient: new CodexCliModelClient({
      defaultModel: model,
      reasoningEffort,
      debug,
      onDebugEvent: debug
        ? event => {
          output.write(`debug> ${formatDebugEvent(event)}\n`)
        }
        : undefined,
    }),
    systemPrompt,
  })

  const rl = readline.createInterface({ input, output })

  output.write(
    `${renderLab1Banner({
      model,
      reasoningEffort,
      cwd: process.cwd(),
    })}\n`,
  )
  output.write('Type exit to quit.\n')

  try {
    while (true) {
      const text = (await rl.question('you> ')).trim()
      if (!text) {
        continue
      }

      if (text === 'exit' || text === 'quit') {
        output.write('bye\n')
        break
      }

      for await (const event of engine.submitUserText(text)) {
        if (event.type === 'assistant_message') {
          output.write(`assistant> ${event.payload.text}\n`)
        }
      }
    }
  } finally {
    rl.close()
  }
}

function formatDebugEvent(event: CodexDebugEvent): string {
  return `[${event.source}] ${event.line}`
}
