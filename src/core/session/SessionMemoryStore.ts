import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface StoredSessionMemory {
  sessionId: string
  summary: string
  summarizedThroughMessageId?: string
  updatedAt: string
}

export class SessionMemoryStore {
  constructor(private readonly rootDir: string) {}

  async load(sessionId: string): Promise<StoredSessionMemory | null> {
    try {
      const text = await readFile(this.getMemoryPath(sessionId), 'utf8')
      return JSON.parse(text) as StoredSessionMemory
    } catch (error) {
      if (isMissingFile(error)) {
        return null
      }

      throw error
    }
  }

  async save(record: StoredSessionMemory): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
    await writeFile(
      this.getMemoryPath(record.sessionId),
      JSON.stringify(record, null, 2),
      'utf8',
    )
  }

  private getMemoryPath(sessionId: string): string {
    return join(this.rootDir, `${encodeURIComponent(sessionId)}.json`)
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
