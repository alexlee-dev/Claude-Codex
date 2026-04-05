import type { Message } from '../../base/types/message.ts'
import { createSystemMessage } from '../../base/utils/messageFactory.ts'
import type { StoredSessionMemory } from '../../core/session/SessionMemoryStore.ts'

export interface SessionMemoryOptions {
  minMessagesForSummary: number
  minMessagesBetweenUpdates: number
  preserveRecentMessages: number
}

export const DEFAULT_SESSION_MEMORY_OPTIONS: SessionMemoryOptions = {
  minMessagesForSummary: 8,
  minMessagesBetweenUpdates: 4,
  preserveRecentMessages: 4,
}

const SECTION_ORDER = [
  'Current State',
  'Task',
  'Important Files',
  'Tool Activity',
  'Errors',
] as const

type SectionName = (typeof SECTION_ORDER)[number]

type SummarySections = {
  currentState: string
  task: string[]
  importantFiles: string[]
  toolActivity: string[]
  errors: string[]
}

export function shouldRefreshSessionMemory(
  messages: readonly Message[],
  existingMemory: StoredSessionMemory | null,
  options: SessionMemoryOptions = DEFAULT_SESSION_MEMORY_OPTIONS,
): boolean {
  const nextBoundaryIndex = getNextSummaryBoundaryIndex(messages, options)
  if (nextBoundaryIndex === null) {
    return false
  }

  if (!existingMemory?.summarizedThroughMessageId) {
    return true
  }

  const boundaryIndex = findBoundaryIndex(messages, existingMemory)

  if (boundaryIndex === -1) {
    return true
  }

  return nextBoundaryIndex - boundaryIndex >= options.minMessagesBetweenUpdates
}

export function buildSessionMemory(
  args: {
    sessionId: string
    messages: readonly Message[]
    existingMemory: StoredSessionMemory | null
    updatedAt?: string
  },
  options: SessionMemoryOptions = DEFAULT_SESSION_MEMORY_OPTIONS,
): StoredSessionMemory | null {
  const { messages, sessionId, existingMemory } = args
  const summaryBoundaryIndex = getSafeSummaryBoundaryIndex(messages, options)
  if (summaryBoundaryIndex === null) {
    return null
  }

  const existingBoundaryIndex = findBoundaryIndex(messages, existingMemory)
  const nextBoundaryMessage = messages[summaryBoundaryIndex]
  if (!nextBoundaryMessage) {
    return null
  }

  const unsummarizedPrefix =
    existingBoundaryIndex >= 0
      ? messages.slice(existingBoundaryIndex + 1, summaryBoundaryIndex + 1)
      : messages.slice(0, summaryBoundaryIndex + 1)

  if (
    unsummarizedPrefix.length === 0 &&
    existingMemory?.summary.trim() &&
    existingMemory.summarizedThroughMessageId === nextBoundaryMessage.id
  ) {
    return existingMemory
  }

  const previousSections = parseSummarySections(existingMemory?.summary ?? '')
  const nextSections = summarizeMessagesToSections(unsummarizedPrefix)
  const mergedSections = mergeSummarySections(previousSections, nextSections)
  const summary = formatSummarySections(mergedSections)

  return {
    sessionId,
    summary,
    summarizedThroughMessageId: nextBoundaryMessage.id,
    updatedAt: args.updatedAt ?? new Date().toISOString(),
  }
}

export function assembleSessionMemoryContext(
  messages: readonly Message[],
  memory: StoredSessionMemory | null,
  options: Pick<SessionMemoryOptions, 'preserveRecentMessages'> = {
    preserveRecentMessages: DEFAULT_SESSION_MEMORY_OPTIONS.preserveRecentMessages,
  },
): readonly Message[] {
  if (!memory?.summary.trim()) {
    return [...messages]
  }

  const recentMessages = getRecentMessages(messages, memory, options)
  if (recentMessages === null) {
    return [...messages]
  }

  return [
    createSystemMessage(
      [
        '[session memory]',
        'Use this as the durable summary of earlier conversation state.',
        'If the summary conflicts with the preserved recent raw messages, trust the recent raw messages.',
        memory.summary,
      ].join('\n\n'),
    ),
    ...recentMessages,
  ]
}

export function prepareMessagesWithSessionMemory(
  messages: readonly Message[],
  memory: StoredSessionMemory | null,
  options: Pick<SessionMemoryOptions, 'preserveRecentMessages'> = {
    preserveRecentMessages: DEFAULT_SESSION_MEMORY_OPTIONS.preserveRecentMessages,
  },
): readonly Message[] {
  return assembleSessionMemoryContext(messages, memory, options)
}

function getRecentMessages(
  messages: readonly Message[],
  memory: StoredSessionMemory | null,
  options: Pick<SessionMemoryOptions, 'preserveRecentMessages'>,
): readonly Message[] | null {
  if (!memory?.summarizedThroughMessageId) {
    return messages.slice(-options.preserveRecentMessages)
  }

  const boundaryIndex = messages.findIndex(
    message => message.id === memory.summarizedThroughMessageId,
  )
  if (boundaryIndex === -1) {
    return null
  }

  return messages.slice(boundaryIndex + 1)
}

export function summarizeMessages(messages: readonly Message[]): string {
  return formatSummarySections(summarizeMessagesToSections(messages))
}

function summarizeMessagesToSections(
  messages: readonly Message[],
): SummarySections {
  const userRequests = collectUserRequests(messages)
  const importantFiles = collectFiles(messages)
  const toolActivity = collectToolActivity(messages)
  const errors = collectErrors(messages)
  const currentState = inferCurrentState(messages)

  return {
    currentState,
    task: userRequests,
    importantFiles,
    toolActivity,
    errors,
  }
}

function collectUserRequests(messages: readonly Message[]): string[] {
  return unique(
    messages
      .filter(message => message.role === 'user')
      .map(message => compactText(message.text))
      .filter(Boolean),
  ).slice(-6)
}

function collectFiles(messages: readonly Message[]): string[] {
  const paths = new Set<string>()

  for (const message of messages) {
    for (const match of message.text.matchAll(
      /\b(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\b/g,
    )) {
      paths.add(match[0])
    }
  }

  return [...paths].slice(0, 8)
}

function collectToolActivity(messages: readonly Message[]): string[] {
  return messages
    .filter(message => message.role === 'tool')
    .map(message => {
      const firstLine = compactText(message.text.split('\n')[0] ?? '')
      return `${message.name ?? 'tool'} -> ${firstLine || '(no summary)'}`
    })
    .slice(-8)
}

function collectErrors(messages: readonly Message[]): string[] {
  return unique(
    messages
      .map(message => compactText(message.text))
      .filter(text => /(^error:| error:|denied|not found|failed|unknown tool)/i.test(text)),
  ).slice(-6)
}

function inferCurrentState(messages: readonly Message[]): string {
  const lastAssistant = [...messages]
    .reverse()
    .find(message => message.role === 'assistant')
  const lastUser = [...messages].reverse().find(message => message.role === 'user')

  if (lastAssistant) {
    return compactText(lastAssistant.text)
  }

  if (lastUser) {
    return `Working from user request: ${compactText(lastUser.text)}`
  }

  return 'No current state captured yet.'
}

function compactText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 180)
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items.filter(Boolean))]
}

function getNextSummaryBoundaryIndex(
  messages: readonly Message[],
  options: SessionMemoryOptions,
): number | null {
  if (messages.length <= options.preserveRecentMessages) {
    return null
  }

  const summarizableCount = messages.length - options.preserveRecentMessages
  if (summarizableCount < options.minMessagesForSummary) {
    return null
  }

  return Math.max(0, messages.length - options.preserveRecentMessages - 1)
}

function getSafeSummaryBoundaryIndex(
  messages: readonly Message[],
  options: SessionMemoryOptions,
): number | null {
  const candidateIndex = getNextSummaryBoundaryIndex(messages, options)
  if (candidateIndex === null) {
    return null
  }

  let boundaryIndex = candidateIndex
  while (boundaryIndex >= 0) {
    const boundaryMessage = messages[boundaryIndex]
    const nextMessage = messages[boundaryIndex + 1]

    if (
      nextMessage?.role === 'tool' &&
      boundaryMessage?.role === 'assistant' &&
      looksLikeToolCall(boundaryMessage.text)
    ) {
      boundaryIndex -= 1
      continue
    }

    break
  }

  return boundaryIndex
}

function findBoundaryIndex(
  messages: readonly Message[],
  memory: StoredSessionMemory | null,
): number {
  if (!memory?.summarizedThroughMessageId) {
    return -1
  }

  return messages.findIndex(
    message => message.id === memory.summarizedThroughMessageId,
  )
}

function parseSummarySections(summary: string): SummarySections {
  if (!summary.trim()) {
    return emptySections()
  }

  const rawSections = new Map<string, string[]>()
  let currentSection: string | null = null

  for (const line of summary.split('\n')) {
    const match = line.match(/^# (.+)$/)
    if (match) {
      currentSection = match[1] ?? null
      if (currentSection) {
        rawSections.set(currentSection, [])
      }
      continue
    }

    if (!currentSection) {
      continue
    }

    rawSections.get(currentSection)?.push(line)
  }

  return {
    currentState: sectionText(rawSections.get('Current State')),
    task: sectionBullets(rawSections.get('Task')),
    importantFiles: sectionBullets(rawSections.get('Important Files')),
    toolActivity: sectionBullets(rawSections.get('Tool Activity')),
    errors: sectionBullets(rawSections.get('Errors')),
  }
}

function mergeSummarySections(
  previous: SummarySections,
  next: SummarySections,
): SummarySections {
  return {
    currentState:
      next.currentState.trim() || previous.currentState || 'No current state captured yet.',
    task: unique([...previous.task, ...next.task]).slice(-8),
    importantFiles: unique([
      ...previous.importantFiles,
      ...next.importantFiles,
    ]).slice(-10),
    toolActivity: unique([
      ...previous.toolActivity,
      ...next.toolActivity,
    ]).slice(-10),
    errors: unique([...previous.errors, ...next.errors]).slice(-8),
  }
}

function formatSummarySections(sections: SummarySections): string {
  const lines: string[] = []

  for (const sectionName of SECTION_ORDER) {
    lines.push(`# ${sectionName}`)
    switch (sectionName) {
      case 'Current State':
        lines.push(sections.currentState || 'No current state captured yet.')
        break
      case 'Task':
        lines.push(
          formatSectionBullets(
            sections.task,
            'No explicit user request captured yet.',
          ),
        )
        break
      case 'Important Files':
        lines.push(
          formatSectionBullets(
            sections.importantFiles,
            'No important files captured yet.',
          ),
        )
        break
      case 'Tool Activity':
        lines.push(
          formatSectionBullets(
            sections.toolActivity,
            'No tool activity captured yet.',
          ),
        )
        break
      case 'Errors':
        lines.push(
          formatSectionBullets(
            sections.errors,
            'No persistent errors captured.',
          ),
        )
        break
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

function formatSectionBullets(items: readonly string[], fallback: string): string {
  if (items.length === 0) {
    return `- ${fallback}`
  }

  return items.map(item => `- ${item}`).join('\n')
}

function sectionText(lines: readonly string[] | undefined): string {
  if (!lines) {
    return ''
  }

  return lines.join('\n').trim()
}

function sectionBullets(lines: readonly string[] | undefined): string[] {
  if (!lines) {
    return []
  }

  return unique(
    lines
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/^- /, '').trim()),
  )
}

function emptySections(): SummarySections {
  return {
    currentState: '',
    task: [],
    importantFiles: [],
    toolActivity: [],
    errors: [],
  }
}

function looksLikeToolCall(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return false
  }

  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown }
    return parsed.type === 'tool_call'
  } catch {
    return false
  }
}
