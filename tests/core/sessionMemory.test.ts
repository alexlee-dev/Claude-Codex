import { expect, test } from 'bun:test'
import {
  createAssistantMessage,
  createToolMessage,
  createUserMessage,
} from '../../src/base/utils/messageFactory.ts'
import {
  assembleSessionMemoryContext,
  buildSessionMemory,
  prepareMessagesWithSessionMemory,
  shouldRefreshSessionMemory,
} from '../../src/labs/lab4/sessionMemory.ts'

test('shouldRefreshSessionMemory waits until enough messages exist', () => {
  const messages = [
    createUserMessage('first'),
    createAssistantMessage('second'),
    createUserMessage('third'),
  ]

  expect(
    shouldRefreshSessionMemory(messages, null, {
      minMessagesForSummary: 4,
      minMessagesBetweenUpdates: 2,
      preserveRecentMessages: 2,
    }),
  ).toBe(false)
})

test('buildSessionMemory summarizes the prefix and preserves a recent tail boundary', () => {
  const messages = [
    createUserMessage('please inspect README.md'),
    createAssistantMessage(
      '{"type":"tool_call","tool":"read_file","input":{"path":"README.md"}}',
    ),
    createToolMessage('read_file', 'FILE: README.md\n\nhello world'),
    createAssistantMessage('I inspected README.md and found the greeting.'),
    createUserMessage('now update the greeting'),
    createAssistantMessage('Next I should edit the README greeting.'),
  ]

  const memory = buildSessionMemory(
    {
      sessionId: 'demo',
      messages,
      existingMemory: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      minMessagesForSummary: 2,
      minMessagesBetweenUpdates: 1,
      preserveRecentMessages: 2,
    },
  )

  expect(memory?.summarizedThroughMessageId).toBe(messages[3]?.id)
  expect(memory?.summary).toContain('# Current State')
  expect(memory?.summary).toContain('# Important Files')
  expect(memory?.summary).toContain('README.md')
})

test('buildSessionMemory moves the boundary back to avoid splitting a tool call and tool result', () => {
  const messages = [
    createUserMessage('inspect README.md'),
    createAssistantMessage(
      '{"type":"tool_call","tool":"read_file","input":{"path":"README.md"}}',
    ),
    createToolMessage('read_file', 'FILE: README.md\n\nhello world'),
    createAssistantMessage('I found the greeting in README.md.'),
  ]

  const memory = buildSessionMemory(
    {
      sessionId: 'demo',
      messages,
      existingMemory: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      minMessagesForSummary: 2,
      minMessagesBetweenUpdates: 1,
      preserveRecentMessages: 2,
    },
  )

  expect(memory?.summarizedThroughMessageId).toBe(messages[0]?.id)
})

test('prepareMessagesWithSessionMemory injects memory and keeps only the recent tail', () => {
  const messages = [
    createUserMessage('step 1'),
    createAssistantMessage('step 1 done'),
    createUserMessage('step 2'),
    createAssistantMessage('step 2 done'),
  ]
  const memory = {
    sessionId: 'demo',
    summary: '# Current State\nStep 1 is done.',
    summarizedThroughMessageId: messages[1]?.id,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  const prepared = prepareMessagesWithSessionMemory(messages, memory, {
    preserveRecentMessages: 2,
  })

  expect(prepared).toHaveLength(3)
  expect(prepared[0]?.role).toBe('system')
  expect(prepared[0]?.text).toContain('[session memory]')
  expect(prepared[1]?.id).toBe(messages[2]?.id)
  expect(prepared[2]?.id).toBe(messages[3]?.id)
})

test('buildSessionMemory advances the summarized boundary incrementally', () => {
  const baseMessages = [
    createUserMessage('inspect README.md'),
    createAssistantMessage('I will inspect README.md'),
    createToolMessage('read_file', 'FILE: README.md\n\nhello world'),
    createAssistantMessage('The greeting is hello world.'),
    createUserMessage('now inspect package.json'),
    createAssistantMessage('Next I should inspect package.json.'),
  ]

  const firstMemory = buildSessionMemory(
    {
      sessionId: 'demo',
      messages: baseMessages,
      existingMemory: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      minMessagesForSummary: 2,
      minMessagesBetweenUpdates: 1,
      preserveRecentMessages: 2,
    },
  )

  const updatedMessages = [
    ...baseMessages,
    createToolMessage('read_file', 'FILE: package.json\n\n{"name":"demo"}'),
    createAssistantMessage('I found the package name in package.json.'),
    createUserMessage('great, continue'),
    createAssistantMessage('Continuing with both README.md and package.json in mind.'),
  ]

  const secondMemory = buildSessionMemory(
    {
      sessionId: 'demo',
      messages: updatedMessages,
      existingMemory: firstMemory,
      updatedAt: '2026-01-01T00:05:00.000Z',
    },
    {
      minMessagesForSummary: 2,
      minMessagesBetweenUpdates: 1,
      preserveRecentMessages: 2,
    },
  )

  expect(firstMemory?.summarizedThroughMessageId).toBe(baseMessages[3]?.id)
  expect(secondMemory?.summarizedThroughMessageId).toBe(updatedMessages[7]?.id)
  expect(secondMemory?.summary).toContain('README.md')
  expect(secondMemory?.summary).toContain('package.json')
})

test('assembleSessionMemoryContext falls back to full messages when memory is missing', () => {
  const messages = [
    createUserMessage('hello'),
    createAssistantMessage('hi'),
  ]

  expect(assembleSessionMemoryContext(messages, null)).toEqual(messages)
})

test('assembleSessionMemoryContext falls back to full messages when the boundary is missing', () => {
  const messages = [
    createUserMessage('step 1'),
    createAssistantMessage('step 1 done'),
    createUserMessage('step 2'),
    createAssistantMessage('step 2 done'),
  ]
  const memory = {
    sessionId: 'demo',
    summary: '# Current State\nStep 1 is done.',
    summarizedThroughMessageId: 'missing-boundary',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  expect(
    assembleSessionMemoryContext(messages, memory, {
      preserveRecentMessages: 2,
    }),
  ).toEqual(messages)
})
