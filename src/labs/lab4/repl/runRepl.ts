import { join } from 'node:path'
import { PersistentTranscript } from '../../../base/transcript/PersistentTranscript.ts'
import type { Message } from '../../../base/types/message.ts'
import { serializeToolTranscript as serializeTranscript } from '../../../core/model/serializeToolTranscript.ts'
import { createLabRepl } from '../../../core/repl/createLabRepl.ts'
import { FileSessionStore } from '../../../core/session/FileSessionStore.ts'
import { SessionMemoryStore } from '../../../core/session/SessionMemoryStore.ts'
import { query } from '../query.ts'
import {
  assembleSessionMemoryContext,
  buildSessionMemory,
  DEFAULT_SESSION_MEMORY_OPTIONS,
  shouldRefreshSessionMemory,
} from '../sessionMemory.ts'

export async function runRepl(): Promise<void> {
  const cwd = process.cwd()
  const sessionId = process.env.LAB4_SESSION_ID ?? 'default'
  const storageRoot =
    process.env.LAB4_STORAGE_ROOT ?? join(cwd, '.claude-codex')
  const sessionStore = new FileSessionStore(join(storageRoot, 'sessions'))
  const memoryStore = new SessionMemoryStore(join(storageRoot, 'session-memory'))
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
    bannerMode: 'repo agent · durable session memory',
    serializeTranscript,
    defaultMaxSteps: 6,
    title: `Claude Codex · ${sessionId}`,
    async createTranscript() {
      const stored = await sessionStore.load(sessionId)
      return new PersistentTranscript<Message>({
        initialMessages: stored?.transcript ?? [],
        persist: messages =>
          sessionStore.save({
            id: sessionId,
            transcript: [...messages],
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
      const existingMemory = await memoryStore.load(sessionId)
      if (!shouldRefreshSessionMemory(messages, existingMemory, memoryOptions)) {
        return
      }

      const nextMemory = buildSessionMemory(
        {
          sessionId,
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
            await memoryStore.load(sessionId),
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

await runRepl()
