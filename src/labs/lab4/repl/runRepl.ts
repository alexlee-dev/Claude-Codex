import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { PersistentTranscript } from '../../../base/transcript/PersistentTranscript.ts'
import type { Message } from '../../../base/types/message.ts'
import { serializeToolTranscript as serializeTranscript } from '../../../core/model/serializeToolTranscript.ts'
import { createLabRepl } from '../../../core/repl/createLabRepl.ts'
import {
  FileSessionStore,
} from '../../../core/session/FileSessionStore.ts'
import { runLabStartupCommand } from '../../runLabStartupCommand.ts'
import type { Lab4StartupSelection } from '../cli/index.ts'
import { SessionMemoryStore } from '../../../core/session/SessionMemoryStore.ts'
import { query } from '../query.ts'
import {
  assembleSessionMemoryContext,
  buildSessionMemory,
  DEFAULT_SESSION_MEMORY_OPTIONS,
  shouldRefreshSessionMemory,
} from '../sessionMemory.ts'

type StartupMode = 'new' | 'resume' | 'continue'

type StartupState = {
  mode: StartupMode
  sessionId: string
  createdAt: string
  initialMessages: readonly Message[]
}

export async function runRepl(): Promise<void> {
  const cwd = process.cwd()
  const storageRoot =
    process.env.LAB4_STORAGE_ROOT ?? join(cwd, '.claude-codex')
  const sessionStore = new FileSessionStore(join(storageRoot, 'sessions'))
  const memoryStore = new SessionMemoryStore(join(storageRoot, 'session-memory'))
  const startupCommand = await runLabStartupCommand<Lab4StartupSelection>({
    labNumber: 4,
    cwd,
  })
  if (startupCommand.handled && startupCommand.result.type === 'exit') {
    return
  }

  const startup = await resolveStartupState({
    sessionStore,
    sessionIdOverride: process.env.LAB4_SESSION_ID,
    selection:
      startupCommand.handled && startupCommand.result.type === 'continue'
        ? startupCommand.result.value
        : undefined,
  })
  const memoryOptions = {
    minMessagesForSummary: readPositiveInt(
      process.env.LAB4_MEMORY_MIN_MESSAGES,
      DEFAULT_SESSION_MEMORY_OPTIONS.minMessagesForSummary,
    ),
    minMessagesBetweenUpdates: readPositiveInt(
      process.env.LAB4_MEMORY_MIN_MESSAGES_BETWEEN_UPDATES,
      DEFAULT_SESSION_MEMORY_OPTIONS.minMessagesBetweenUpdates,
    ),
    preserveRecentMessages: readPositiveInt(
      process.env.LAB4_MEMORY_PRESERVE_RECENT_MESSAGES,
      DEFAULT_SESSION_MEMORY_OPTIONS.preserveRecentMessages,
    ),
  }

  await createLabRepl({
    labNumber: 4,
    systemPrompt:
      process.env.CODEX_SYSTEM_PROMPT ??
      [
        'You are Claude-Codex, a session-aware repository coding agent running inside a local agent framework.',
        'You may either answer directly or use one tool at a time.',
        'Use read_file and search_code to inspect the repo before editing.',
        'Use replace_in_file for exact text replacements and run_command only for approved verification commands.',
        'Session memory may summarize earlier work. Use it as durable context, but trust the preserved recent raw messages when they are more specific.',
        'Return only one JSON object and nothing else.',
        'For a direct answer, return {"type":"final","text":"..."}',
        'For a tool call, return {"type":"tool_call","tool":"read_file","input":{"path":"src/main.ts"}}',
        'For run_command, only use {"command":"bun","args":["test"]} or {"command":"cat","args":["relative/path"]}.',
        'For replace_in_file, use the smallest unique old_string that still identifies the target.',
        'Never invent tool outputs. After receiving a <tool> message, decide the next step.',
        'Keep answers concise and grounded in the repository.',
      ].join('\n'),
    query,
    mockEnvVar: 'LAB4_MOCK_RESPONSES',
    maxStepsEnvVar: 'LAB4_MAX_STEPS',
    bannerMode: `repo agent · durable session memory · ${startup.mode}`,
    serializeTranscript,
    defaultMaxSteps: 6,
    title: `Claude Codex · ${startup.sessionId}`,
    async createTranscript() {
      return new PersistentTranscript<Message>({
        initialMessages: startup.initialMessages,
        persist: messages =>
          sessionStore.save({
            id: startup.sessionId,
            transcript: [...messages],
            createdAt: startup.createdAt,
            updatedAt: new Date().toISOString(),
          }),
      })
    },
    async afterSubmit({ transcript }) {
      if (typeof transcript === 'object' && transcript !== null) {
        const candidate = transcript as { flush?: () => Promise<void> }
        await candidate.flush?.()
      }

      const messages = transcript.getMessages()
      const existingMemory = await memoryStore.load(startup.sessionId)
      if (!shouldRefreshSessionMemory(messages, existingMemory, memoryOptions)) {
        return
      }

      const nextMemory = buildSessionMemory(
        {
          sessionId: startup.sessionId,
          messages,
          existingMemory,
        },
        memoryOptions,
      )
      if (!nextMemory) {
        return
      }

      await memoryStore.save(nextMemory)
    },
    createQueryOptions({ tools, cwd, maxSteps, requestToolApproval }) {
      return {
        tools,
        cwd,
        maxSteps,
        requestToolApproval,
        prepareMessages: async ({ messages }: { messages: readonly Message[] }) =>
          assembleSessionMemoryContext(
            messages,
            await memoryStore.load(startup.sessionId),
            {
              preserveRecentMessages: memoryOptions.preserveRecentMessages,
            },
          ),
      }
    },
  })
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? String(fallback))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function resolveStartupState(args: {
  sessionStore: FileSessionStore
  sessionIdOverride?: string
  selection?: Lab4StartupSelection
}): Promise<StartupState> {
  const command = args.selection ?? { mode: 'new' }

  if (command.mode === 'continue') {
    const latest = await args.sessionStore.loadLatest()
    if (!latest) {
      throw new Error('No saved lab4 sessions found for continue.')
    }

    return {
      mode: 'continue',
      sessionId: latest.id,
      createdAt: latest.createdAt ?? latest.updatedAt,
      initialMessages: latest.transcript,
    }
  }

  if (command.mode === 'resume') {
    const record = await args.sessionStore.load(command.sessionId)
    if (!record) {
      throw new Error(`Session not found: ${command.sessionId}`)
    }

    return {
      mode: 'resume',
      sessionId: record.id,
      createdAt: record.createdAt ?? record.updatedAt,
      initialMessages: record.transcript,
    }
  }

  const sessionId = args.sessionIdOverride ?? generateSessionId()
  if (await args.sessionStore.load(sessionId)) {
    throw new Error(
      `Cannot create a new session because "${sessionId}" already exists.`,
    )
  }

  return {
    mode: 'new',
    sessionId,
    createdAt: new Date().toISOString(),
    initialMessages: [],
  }
}

function generateSessionId(now: Date = new Date()): string {
  const timestamp = now.toISOString().replaceAll(/[-:.]/g, '')
  const randomSuffix = randomUUID().replaceAll('-', '').slice(0, 12)
  return `${timestamp}-${randomSuffix}`
}

await runRepl()
