import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
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

test('FileSessionStore saves, loads, and lists sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-codex-session-store-'))

  try {
    const store = new FileSessionStore(root)
    await store.save({
      id: 'session-a',
      transcript: [
        createUserMessage('hello'),
        createAssistantMessage('hi'),
      ],
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    const loaded = await store.load('session-a')

    expect(loaded?.id).toBe('session-a')
    expect(loaded?.transcript).toHaveLength(2)
    expect(await store.list()).toEqual(['session-a'])
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
