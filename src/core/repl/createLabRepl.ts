import { stdout as output } from 'node:process'
import {
  type CodexDebugEvent,
  CodexCliModelClient,
} from '../../base/model/CodexCliModelClient.ts'
import {
  MockModelClient,
  parseMockResponsesFromEnv,
} from '../../base/model/MockModelClient.ts'
import { InMemoryTranscript } from '../../base/transcript/InMemoryTranscript.ts'
import type { AgentEvent } from '../../base/types/agent.ts'
import type { Message } from '../../base/types/message.ts'
import type { ModelClient } from '../../base/types/model.ts'
import {
  createAssistantMessage,
  createUserMessage,
} from '../../base/utils/messageFactory.ts'
import { QueryEngine, type QueryFunction } from '../engine/QueryEngine.ts'
import type { ToolApprovalRequest } from '../query/createToolAgentQuery.ts'
import { labToolRegistrations } from '../../labs/index.ts'
import {
  ToolRegistry,
  type Tool,
  renderToolCatalog,
} from '../tools/ToolRegistry.ts'
import { runReplSession } from './runReplSession.ts'

const labToolRegistry = new ToolRegistry(labToolRegistrations)

export interface CreateLabReplOptions<TQueryOptions extends object> {
  labNumber?: number
  systemPrompt: string
  query: QueryFunction<Message, AgentEvent, TQueryOptions>
  mockEnvVar: string
  bannerMode: string
  serializeTranscript: (
    messages: readonly Message[],
    systemPrompt?: string,
  ) => string
  maxStepsEnvVar?: string
  defaultMaxSteps?: number
  includeToolCatalog?: boolean
  title?: string
  createQueryOptions?: (args: {
    tools: Tool[]
    cwd: string
    maxSteps?: number
    requestToolApproval?: (request: ToolApprovalRequest) => Promise<boolean>
  }) => TQueryOptions
}

export async function createLabRepl<TQueryOptions extends object>(
  options: CreateLabReplOptions<TQueryOptions>,
): Promise<void> {
  const debug = process.env.DEBUG === '1'
  const model = process.env.CODEX_MODEL ?? 'gpt-5.4-mini'
  const reasoningEffort =
    (process.env.CODEX_REASONING_EFFORT as
      | 'low'
      | 'medium'
      | 'high'
      | 'none'
      | undefined) ?? 'low'
  const cwd = process.cwd()
  const tools =
    options.labNumber === undefined
      ? []
      : labToolRegistry.getToolsForLab(options.labNumber)
  const maxSteps =
    options.maxStepsEnvVar === undefined
      ? undefined
      : normalizeMaxSteps(
          process.env[options.maxStepsEnvVar],
          options.defaultMaxSteps ?? 4,
        )
  const systemPrompt =
    options.includeToolCatalog === false
      ? options.systemPrompt
      : buildSystemPromptWithTools(options.systemPrompt, tools)
  const toolApprovalBridge: {
    handler?:
      | ((request: {
          toolName: string
          description: string
          input: Record<string, unknown>
        }) => Promise<boolean>)
      | undefined
  } = {}

  const transcript = new InMemoryTranscript<Message>()
  const session = new QueryEngine({
    transcript,
    modelClient: createModelClientFromEnv({
      model,
      reasoningEffort,
      debug,
      output,
      mockEnvVar: options.mockEnvVar,
      serializeTranscript: options.serializeTranscript,
    }),
    query: options.query,
    createUserMessage,
    queryOptions: (options.createQueryOptions?.({
      tools,
      cwd,
      maxSteps,
      requestToolApproval: request =>
        toolApprovalBridge.handler?.({
          toolName: request.tool.name,
          description: request.tool.description,
          input: request.input,
        }) ?? Promise.resolve(false),
    }) ??
      {}) as TQueryOptions,
    systemPrompt,
  })

  await runReplSession({
    session,
    banner: {
      model,
      reasoningEffort,
      cwd,
      title: options.title ?? 'Claude Codex',
      mode: options.bannerMode,
    },
    toolCatalog: tools.length === 0 ? '' : renderToolCatalog(tools),
    setToolApprovalHandler(handler) {
      toolApprovalBridge.handler = handler
    },
    renderEvent(event: AgentEvent, stream) {
      if (event.type === 'assistant_message') {
        stream.write(`assistant> ${event.payload.text}\n`)
        return
      }

      if (event.type === 'tool_call') {
        stream.write(
          `tool:${event.payload.tool}> ${JSON.stringify(event.payload.input)}\n`,
        )
        return
      }

      if (event.type === 'tool_result') {
        const label = event.payload.isError ? 'tool:error' : 'tool:result'
        stream.write(`${label}:${event.payload.tool}> ${event.payload.output}\n`)
      }
    },
  })
}

function buildSystemPromptWithTools(
  systemPrompt: string,
  tools: ReadonlyArray<{
    name: string
    description: string
    inputHint: string
  }>,
): string {
  if (tools.length === 0) {
    return systemPrompt
  }

  return [systemPrompt, 'Available tools:', renderToolCatalog(tools)].join('\n')
}

function normalizeMaxSteps(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? String(fallback))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function formatDebugEvent(event: CodexDebugEvent): string {
  return `[${event.source}] ${event.line}`
}

function createModelClientFromEnv(args: {
  model: string
  reasoningEffort: 'low' | 'medium' | 'high' | 'none'
  debug: boolean
  output: NodeJS.WriteStream
  mockEnvVar: string
  serializeTranscript: (
    messages: readonly Message[],
    systemPrompt?: string,
  ) => string
}): ModelClient<Message> {
  if (
    process.env[args.mockEnvVar.replace('_MOCK_RESPONSES', '_MODEL_BACKEND')] ===
    'mock'
  ) {
    return new MockModelClient({
      responses: parseMockResponsesFromEnv(args.mockEnvVar),
      createAssistantMessage,
    })
  }

  return new CodexCliModelClient({
    serializeTranscript: args.serializeTranscript,
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
