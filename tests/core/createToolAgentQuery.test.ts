import { expect, test } from 'bun:test'
import { InMemoryTranscript } from '../../src/base/transcript/InMemoryTranscript.ts'
import type { Message } from '../../src/base/types/message.ts'
import type { ModelClient } from '../../src/base/types/model.ts'
import {
  createAssistantMessage,
  createUserMessage,
} from '../../src/base/utils/messageFactory.ts'
import { createToolAgentQuery } from '../../src/core/query/createToolAgentQuery.ts'
import type { Tool } from '../../src/core/tools/ToolRegistry.ts'

test('createToolAgentQuery appends full tool output when no materializer is configured', async () => {
  const transcript = new InMemoryTranscript<Message>([createUserMessage('search')])
  const query = createToolAgentQuery({
    defaultMaxSteps: 2,
    stepLimitMessage: 'step limit',
  })

  await consume(
    query({
      transcript,
      modelClient: createStaticModelClient([
        '{"type":"tool_call","tool":"search_code","input":{"query":"needle"}}',
        '{"type":"final","text":"done"}',
      ]),
      tools: [
        createTool('search_code', async () => 'very large tool output that stays inline'),
      ],
    }),
  )

  const toolMessage = transcript
    .getMessages()
    .find(message => message.role === 'tool')

  expect(toolMessage?.text).toBe('very large tool output that stays inline')
  expect(toolMessage?.artifact).toBeUndefined()
})

test('createToolAgentQuery appends materialized tool output and artifact metadata', async () => {
  const transcript = new InMemoryTranscript<Message>([createUserMessage('search')])
  const query = createToolAgentQuery({
    defaultMaxSteps: 2,
    stepLimitMessage: 'step limit',
  })

  let seenMessageId: string | undefined

  await consume(
    query({
      transcript,
      modelClient: createStaticModelClient([
        '{"type":"tool_call","tool":"search_code","input":{"query":"needle"}}',
        '{"type":"final","text":"done"}',
      ]),
      tools: [
        createTool('search_code', async () => 'very large tool output that will be externalized'),
      ],
      materializeToolResult: async args => {
        seenMessageId = args.messageId
        return {
          messageText: 'preview only',
          artifact: {
            kind: 'tool_result',
            relativePath: '.claude-codex/tool-results/demo/tool-msg.txt',
            byteLength: 123,
          },
        }
      },
    }),
  )

  const toolMessage = transcript
    .getMessages()
    .find(message => message.role === 'tool')

  expect(seenMessageId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  )
  expect(toolMessage?.id).toBe(seenMessageId)
  expect(toolMessage?.text).toBe('preview only')
  expect(toolMessage?.artifact).toEqual({
    kind: 'tool_result',
    relativePath: '.claude-codex/tool-results/demo/tool-msg.txt',
    byteLength: 123,
  })
})

function createStaticModelClient(
  responses: string[],
): ModelClient<Message> {
  return {
    async generate() {
      const next = responses.shift()
      if (!next) {
        throw new Error('no more model responses')
      }

      return {
        message: createAssistantMessage(next),
      }
    },
  }
}

function createTool(
  name: string,
  run: Tool['run'],
): Tool {
  return {
    name,
    description: `${name} tool`,
    inputHint: '{}',
    run,
  }
}

async function consume<T>(iterable: AsyncIterable<T>): Promise<void> {
  for await (const _value of iterable) {
    void _value
  }
}
