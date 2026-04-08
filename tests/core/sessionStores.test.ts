import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PersistentTranscript } from '../../src/base/transcript/PersistentTranscript.ts'
import {
  createAssistantMessage,
  createUserMessage,
} from '../../src/base/utils/messageFactory.ts'
import { FileSessionStore } from '../../src/core/session/FileSessionStore.ts'
import {
  SessionMemoryStore,
  type StoredSessionMemory,
} from '../../src/core/session/SessionMemoryStore.ts'

test('FileSessionStore saves, appends, loads, and lists sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-codex-session-store-'))

  try {
    const store = new FileSessionStore(root)
    await store.save({
      id: 'session-a',
      transcript: [
        createUserMessage('hello'),
        createAssistantMessage('hi'),
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await store.save({
      id: 'session-b',
      transcript: [createUserMessage('later')],
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:02.000Z',
    })
    await store.appendMessages({
      sessionId: 'session-a',
      messages: [createAssistantMessage('follow-up')],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:03.000Z',
    })

    const loaded = await store.load('session-a')
    const summaries = await store.listSummaries()
    const latest = await store.loadLatest()
    const transcriptLogText = await readFile(join(root, 'session-a.jsonl'), 'utf8')
    const transcriptLogEntries = transcriptLogText
      .trim()
      .split('\n')
      .map(line => {
        const record = JSON.parse(line) as { type: string; version: number }
        return { type: record.type, version: record.version }
      })

    expect(loaded?.id).toBe('session-a')
    expect(loaded?.transcript).toHaveLength(3)
    expect(await store.list()).toEqual(['session-a', 'session-b'])
    expect(summaries.map(summary => summary.id)).toEqual([
      'session-a',
      'session-b',
    ])
    expect(summaries[0]?.summary).toBe('hello')
    expect(summaries[1]?.summary).toBe('later')
    expect(latest?.id).toBe('session-a')
    expect(transcriptLogEntries).toEqual([
      { type: 'message', version: 1 },
      { type: 'message', version: 1 },
      { type: 'message', version: 1 },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('FileSessionStore loads legacy raw-message transcript logs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-codex-session-store-legacy-'))

  try {
    const store = new FileSessionStore(root)
    await writeFile(
      join(root, 'legacy-session.meta.json'),
      JSON.stringify(
        {
          id: 'legacy-session',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:01.000Z',
          messageCount: 2,
          summary: 'legacy user text',
          summarySourceRole: 'user',
        },
        null,
        2,
      ),
      'utf8',
    )
    await writeFile(
      join(root, 'legacy-session.jsonl'),
      [
        JSON.stringify(createUserMessage('legacy user text')),
        JSON.stringify(createAssistantMessage('legacy assistant text')),
      ].join('\n') + '\n',
      'utf8',
    )

    const loaded = await store.load('legacy-session')

    expect(loaded?.id).toBe('legacy-session')
    expect(loaded?.transcript.map(message => message.text)).toEqual([
      'legacy user text',
      'legacy assistant text',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('SessionMemoryStore saves and loads session memory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-codex-memory-store-'))

  try {
    const store = new SessionMemoryStore(root)
    const record: StoredSessionMemory = {
      sessionId: 'memory-a',
      summary: '# Current State\nWorking on README.md',
      summarizedThroughMessageId: 'msg-123',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    await store.save(record)

    expect(await store.load('missing')).toBeNull()
    expect(await store.load('memory-a')).toEqual(record)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('PersistentTranscript recovers after a failed persist and later writes succeed', async () => {
  let callCount = 0
  const snapshots: string[][] = []
  const transcript = new PersistentTranscript({
    persist: async messages => {
      callCount += 1
      const texts = messages.map(message => {
        const candidate = message as { text?: string }
        return candidate.text ?? ''
      })

      if (callCount === 1) {
        throw new Error('simulated persist failure')
      }

      snapshots.push(texts)
    },
  })

  transcript.append(createUserMessage('first'))
  await expect(transcript.flush()).rejects.toThrow('simulated persist failure')

  transcript.append(createAssistantMessage('second'))
  await transcript.flush()

  expect(snapshots).toEqual([['first', 'second']])
})
