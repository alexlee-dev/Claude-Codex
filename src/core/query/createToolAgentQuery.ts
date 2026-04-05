import type { AgentEvent } from '../../base/types/agent.ts'
import type { Message } from '../../base/types/message.ts'
import type { ModelClient } from '../../base/types/model.ts'
import type { Transcript } from '../../base/types/transcript.ts'
import {
  createAssistantMessage,
  createToolMessage,
} from '../../base/utils/messageFactory.ts'
import type { Tool } from '../tools/ToolRegistry.ts'

export interface ToolApprovalRequest {
  tool: Tool
  input: Record<string, unknown>
}

export interface ToolAgentQueryArgs {
  transcript: Transcript<Message>
  modelClient: ModelClient<Message>
  tools: readonly Tool[]
  systemPrompt?: string
  model?: string
  cwd?: string
  maxSteps?: number
  requestToolApproval?: (request: ToolApprovalRequest) => Promise<boolean>
  prepareMessages?: (args: {
    messages: readonly Message[]
  }) => readonly Message[] | Promise<readonly Message[]>
}

type AgentAction =
  | {
      type: 'final'
      text: string
    }
  | {
      type: 'tool_call'
      tool: string
      input: Record<string, unknown>
    }

export function createToolAgentQuery(options: {
  defaultMaxSteps: number
  stepLimitMessage: string
}): (args: ToolAgentQueryArgs) => AsyncGenerator<AgentEvent, void> {
  return async function* query(
    args: ToolAgentQueryArgs,
  ): AsyncGenerator<AgentEvent, void> {
    const {
      transcript,
      modelClient,
      tools,
      systemPrompt,
      model,
      cwd = process.cwd(),
      maxSteps = options.defaultMaxSteps,
      requestToolApproval,
    } = args

    const toolMap = new Map(tools.map(tool => [tool.name, tool]))

    for (let step = 0; step < maxSteps; step += 1) {
      const preparedMessages =
        (await args.prepareMessages?.({
          messages: transcript.getMessages(),
        })) ?? transcript.getMessages()

      const response = await modelClient.generate({
        systemPrompt,
        messages: preparedMessages,
        model,
      })

      const action = parseAgentAction(response.message.text)

      if (!action) {
        transcript.append(response.message)
        yield {
          type: 'assistant_message',
          payload: { text: response.message.text },
        }
        return
      }

      if (action.type === 'final') {
        transcript.append(createAssistantMessage(action.text))
        yield {
          type: 'assistant_message',
          payload: { text: action.text },
        }
        return
      }

      transcript.append(response.message)

      yield {
        type: 'tool_call',
        payload: {
          tool: action.tool,
          input: action.input,
        },
      }

      const result = await runToolCall(
        action,
        toolMap,
        cwd,
        requestToolApproval,
      )
      transcript.append(createToolMessage(action.tool, result.output))

      yield {
        type: 'tool_result',
        payload: {
          tool: action.tool,
          output: result.output,
          isError: result.isError,
        },
      }
    }

    transcript.append(createAssistantMessage(options.stepLimitMessage))
    yield {
      type: 'assistant_message',
      payload: { text: options.stepLimitMessage },
    }
  }
}

async function runToolCall(
  action: Extract<AgentAction, { type: 'tool_call' }>,
  toolMap: ReadonlyMap<string, Tool>,
  cwd: string,
  requestToolApproval?: (request: ToolApprovalRequest) => Promise<boolean>,
): Promise<{ output: string; isError: boolean }> {
  const tool = toolMap.get(action.tool)
  if (!tool) {
    return {
      output: `ERROR: unknown tool "${action.tool}"`,
      isError: true,
    }
  }

  try {
    if (tool.requiresApproval) {
      const approved =
        (await requestToolApproval?.({
          tool,
          input: action.input,
        })) ?? false

      if (!approved) {
        return {
          output: 'ERROR: tool call denied by user',
          isError: true,
        }
      }
    }

    const output = await tool.run(action.input, { cwd })
    return { output, isError: false }
  } catch (error) {
    return {
      output: `ERROR: ${formatError(error)}`,
      isError: true,
    }
  }
}

function parseAgentAction(text: string): AgentAction | null {
  const candidate = extractJsonObject(text)
  if (!candidate) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return null
  }

  if (!isObject(parsed) || typeof parsed.type !== 'string') {
    return null
  }

  if (parsed.type === 'final' && typeof parsed.text === 'string') {
    return {
      type: 'final',
      text: parsed.text,
    }
  }

  if (
    parsed.type === 'tool_call' &&
    typeof parsed.tool === 'string' &&
    isObject(parsed.input)
  ) {
    return {
      type: 'tool_call',
      tool: parsed.tool,
      input: parsed.input,
    }
  }

  return null
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim()

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    const fenced = fenceMatch[1].trim()
    if (fenced.startsWith('{') && fenced.endsWith('}')) {
      return fenced
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
