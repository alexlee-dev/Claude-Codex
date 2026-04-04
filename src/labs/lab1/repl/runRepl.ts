import { stdout as output } from 'node:process'
import {
  type CodexDebugEvent,
  CodexCliModelClient,
} from '../../../base/model/CodexCliModelClient.ts'
import {
  MockModelClient,
  parseMockResponsesFromEnv,
} from '../../../base/model/MockModelClient.ts'
import { InMemoryTranscript as BaseInMemoryTranscript } from '../../../base/transcript/InMemoryTranscript.ts'
import type { Message } from '../../../base/types/message.ts'
import type { ModelClient } from '../../../base/types/model.ts'
import { createAssistantMessage } from '../../../base/utils/messageFactory.ts'
import { createUserMessage } from '../../../base/utils/messageFactory.ts'
import { QueryEngine } from '../../../core/engine/QueryEngine.ts'
import { runReplSession } from '../../../core/repl/runReplSession.ts'
import type { AgentEvent } from '../../../base/types/agent.ts'
import { serializeTranscript } from '../model/serializeTranscript.ts'
import { query } from '../query.ts'

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
      'You are Claude-Codex, a minimal assistant running inside a local agent framework.',
      'This lab supports multi-turn chat only.',
      'Do not run commands or use tools.',
      'Answer concisely and continue the conversation naturally.',
    ].join(' ')

  const transcript = new BaseInMemoryTranscript<Message>()
  const session = new QueryEngine({
    transcript,
    modelClient: createModelClientFromEnv({
      model,
      reasoningEffort,
      debug,
      output,
    }),
    systemPrompt,
    query,
    createUserMessage,
  })

  await runReplSession({
    session,
    banner: {
      model,
      reasoningEffort,
      cwd: process.cwd(),
      title: 'Claude Codex',
      mode: 'multi-turn chat · no tools',
    },
    renderEvent(event: AgentEvent, output) {
      if (event.type === 'assistant_message') {
        output.write(`assistant> ${event.payload.text}\n`)
      }
    },
  })
}

function formatDebugEvent(event: CodexDebugEvent): string {
  return `[${event.source}] ${event.line}`
}

function createModelClientFromEnv(args: {
  model: string
  reasoningEffort: 'low' | 'medium' | 'high' | 'none'
  debug: boolean
  output: NodeJS.WriteStream
}): ModelClient<Message> {
  if (process.env.LAB1_MODEL_BACKEND === 'mock') {
    return new MockModelClient({
      responses: parseMockResponsesFromEnv('LAB1_MOCK_RESPONSES'),
      createAssistantMessage,
    })
  }

  return new CodexCliModelClient({
    serializeTranscript,
    createAssistantMessage,
    defaultModel: args.model,
    reasoningEffort: args.reasoningEffort,
    debug: args.debug,
    onDebugEvent: args.debug
      ? event => {
        args.output.write(`debug> ${formatDebugEvent(event)}\n`)
      }
      : undefined,
  })
}

await runRepl()
