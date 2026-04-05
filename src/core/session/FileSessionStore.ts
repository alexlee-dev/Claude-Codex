import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Message } from '../../base/types/message.ts'

export interface StoredSession {
  id: string
  transcript: Message[]
  updatedAt: string
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

  private getSessionPath(sessionId: string): string {
    return join(this.rootDir, `${encodeSessionId(sessionId)}.json`)
  }
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
