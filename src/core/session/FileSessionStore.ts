import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Message } from '../../base/types/message.ts'

export interface StoredSession {
  id: string
  transcript: Message[]
  createdAt?: string
  updatedAt: string
}

export interface StoredSessionSummary {
  id: string
  createdAt?: string
  updatedAt: string
  messageCount: number
  summary: string
}

export class FileSessionStore {
  constructor(private readonly rootDir: string) {}

  async load(sessionId: string): Promise<StoredSession | null> {
    try {
      const text = await readFile(this.getSessionPath(sessionId), 'utf8')
      return JSON.parse(text) as StoredSession
    } catch (error) {
      if (isMissingFile(error)) {
        return null
      }

      throw error
    }
  }

  async save(record: StoredSession): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
    await writeFile(
      this.getSessionPath(record.id),
      JSON.stringify(record, null, 2),
      'utf8',
    )
  }

  async list(): Promise<string[]> {
    try {
      const entries = await readdir(this.rootDir, { withFileTypes: true })
      return entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => decodeSessionId(entry.name.slice(0, -'.json'.length)))
        .sort()
    } catch (error) {
      if (isMissingFile(error)) {
        return []
      }

      throw error
    }
  }

  async listSummaries(): Promise<StoredSessionSummary[]> {
    const sessionIds = await this.list()
    const records: Array<StoredSessionSummary | null> = await Promise.all(
      sessionIds.map(async (sessionId): Promise<StoredSessionSummary | null> => {
        const record = await this.load(sessionId)
        if (!record) {
          return null
        }

        return {
          id: record.id,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          messageCount: record.transcript.length,
          summary: summarizeTranscript(record.transcript),
        }
      }),
    )

    return records
      .filter((record): record is StoredSessionSummary => record !== null)
      .sort(compareSessionsByUpdatedAtDesc)
  }

  async loadLatest(): Promise<StoredSession | null> {
    const [latest] = await this.listSummaries()
    if (!latest) {
      return null
    }

    return await this.load(latest.id)
  }

  private getSessionPath(sessionId: string): string {
    return join(this.rootDir, `${encodeSessionId(sessionId)}.json`)
  }
}

function compareSessionsByUpdatedAtDesc(
  left: StoredSessionSummary,
  right: StoredSessionSummary,
): number {
  const leftTime = Date.parse(left.updatedAt)
  const rightTime = Date.parse(right.updatedAt)

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return right.id.localeCompare(left.id)
  }

  if (Number.isNaN(leftTime)) {
    return 1
  }

  if (Number.isNaN(rightTime)) {
    return -1
  }

  return rightTime - leftTime
}

function summarizeTranscript(messages: readonly Message[]): string {
  const preferredMessage =
    [...messages].reverse().find(message => message.role === 'user') ??
    [...messages].reverse().find(message => message.role === 'assistant') ??
    messages[messages.length - 1]

  if (!preferredMessage) {
    return '(empty session)'
  }

  const compact = preferredMessage.text.replace(/\s+/g, ' ').trim()
  if (!compact) {
    return '(empty session)'
  }

  return compact.length > 80 ? `${compact.slice(0, 79)}…` : compact
}

function encodeSessionId(sessionId: string): string {
  return encodeURIComponent(sessionId)
}

function decodeSessionId(fileName: string): string {
  return decodeURIComponent(fileName)
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
