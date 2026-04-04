import { stdout as output } from 'node:process'
import {
  type CodexDebugEvent,
  CodexCliModelClient,
} from '../../../base/model/CodexCliModelClient.ts'
import {
  MockModelClient,
  parseMockResponsesFromEnv,
} from '../../../base/model/MockModelClient.ts'
import { InMemoryTranscript } from '../../../base/transcript/InMemoryTranscript.ts'
import type { AgentEvent } from '../../../base/types/agent.ts'
import type { Message } from '../../../base/types/message.ts'
import { createAssistantMessage } from '../../../base/utils/messageFactory.ts'
import { createUserMessage } from '../../../base/utils/messageFactory.ts'
import type { ModelClient } from '../../../base/types/model.ts'
import { QueryEngine } from '../../../core/engine/QueryEngine.ts'
import { runReplSession } from '../../../core/repl/runReplSession.ts'
import { serializeTranscript } from '../model/serializeTranscript.ts'
import { query } from '../query.ts'
import { getBuiltinTools, renderToolCatalog } from '../tools.ts'

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
  const maxSteps = Number(process.env.LAB2_MAX_STEPS ?? '4')
  const cwd = process.cwd()
  const tools = getBuiltinTools()
  const systemPrompt =
    process.env.CODEX_SYSTEM_PROMPT ??
    [
      'You are Claude-Coded, a minimal repository assistant running inside a local agent framework.',
      'You may either answer directly or use one tool at a time.',
      'Use tools when the user asks about repository structure, file contents, or code search.',
      'Available tools:',
      renderToolCatalog(tools),
      'Return only one JSON object and nothing else.',
      'For a direct answer, return {"type":"final","text":"..."}',
      'For a tool call, return {"type":"tool_call","tool":"read_file","input":{"path":"src/main.ts"}}',
      'Never invent tool outputs. After receiving a <tool> message, decide the next step.',
      'Keep answers concise and grounded in the repository.',
    ].join('\n')

  const transcript = new InMemoryTranscript<Message>()
  const session = new QueryEngine({
    transcript,
    modelClient: createModelClientFromEnv({
      model,
      reasoningEffort,
      debug,
      output,
    }),
    query,
    createUserMessage,
    queryOptions: {
      tools,
      cwd,
      maxSteps: Number.isFinite(maxSteps) && maxSteps > 0 ? maxSteps : 4,
    },
    systemPrompt,
  })

  await runReplSession({
    session,
    banner: {
      model,
      reasoningEffort,
      cwd,
      title: 'Claude Codex',
      mode: 'repo agent · read-only tools',
    },
    renderEvent(event: AgentEvent, output) {
      if (event.type === 'assistant_message') {
        output.write(`assistant> ${event.payload.text}\n`)
        return
      }

      if (event.type === 'tool_call') {
        output.write(
          `tool:${event.payload.tool}> ${JSON.stringify(event.payload.input)}\n`,
        )
        return
      }

      if (event.type === 'tool_result') {
        const label = event.payload.isError ? 'tool:error' : 'tool:result'
        output.write(`${label}:${event.payload.tool}> ${event.payload.output}\n`)
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
  if (process.env.LAB2_MODEL_BACKEND === 'mock') {
    return new MockModelClient({
      responses: parseMockResponsesFromEnv('LAB2_MOCK_RESPONSES'),
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
