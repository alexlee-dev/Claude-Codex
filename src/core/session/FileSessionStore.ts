import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
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

interface StoredSessionMetadata extends StoredSessionSummary {
  summarySourceRole?: Message['role']
}

interface SessionTranscriptMessageRecordV1 {
  type: 'message'
  version: 1
  message: Message
}

export class FileSessionStore {
  constructor(private readonly rootDir: string) {}

  async load(sessionId: string): Promise<StoredSession | null> {
    const metadata = await this.loadMetadata(sessionId)
    if (!metadata) {
      return null
    }

    return {
      id: metadata.id,
      transcript: await this.loadTranscriptLog(sessionId),
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    }
  }

  async save(record: StoredSession): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
    const metadata = buildMetadata(record)
    const transcriptText = serializeTranscriptLog(record.transcript)

    await writeFile(
      this.getMetadataPath(record.id),
      JSON.stringify(metadata, null, 2),
      'utf8',
    )
    await writeFile(
      this.getTranscriptLogPath(record.id),
      transcriptText,
      'utf8',
    )
  }

  async appendMessages(args: {
    sessionId: string
    messages: readonly Message[]
    createdAt?: string
    updatedAt: string
  }): Promise<void> {
    if (args.messages.length === 0) {
      return
    }

    await mkdir(this.rootDir, { recursive: true })
    let metadata =
      (await this.loadMetadata(args.sessionId)) ?? {
      id: args.sessionId,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
      messageCount: 0,
      summary: '(empty session)',
    }

    await appendFile(
      this.getTranscriptLogPath(args.sessionId),
      serializeTranscriptLog(args.messages),
      'utf8',
    )

    for (const message of args.messages) {
      metadata = applyMessageToMetadata(metadata, message)
    }

    metadata.createdAt ??= args.createdAt
    metadata.updatedAt = args.updatedAt

    await writeFile(
      this.getMetadataPath(args.sessionId),
      JSON.stringify(metadata, null, 2),
      'utf8',
    )
  }

  async list(): Promise<string[]> {
    try {
      const entries = await readdir(this.rootDir, { withFileTypes: true })
      const sessionIds = new Set<string>()

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(metadataSuffix)) {
          sessionIds.add(
            decodeSessionId(entry.name.slice(0, -metadataSuffix.length)),
          )
        }
      }

      return [...sessionIds].sort()
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
        const metadata = await this.loadMetadata(sessionId)
        if (!metadata) {
          return null
        }

        return {
          id: metadata.id,
          createdAt: metadata.createdAt,
          updatedAt: metadata.updatedAt,
          messageCount: metadata.messageCount,
          summary: metadata.summary,
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

  private getMetadataPath(sessionId: string): string {
    return join(this.rootDir, `${encodeSessionId(sessionId)}${metadataSuffix}`)
  }

  private getTranscriptLogPath(sessionId: string): string {
    return join(this.rootDir, `${encodeSessionId(sessionId)}.jsonl`)
  }

  private async loadMetadata(
    sessionId: string,
  ): Promise<StoredSessionMetadata | null> {
    try {
      const text = await readFile(this.getMetadataPath(sessionId), 'utf8')
      return JSON.parse(text) as StoredSessionMetadata
    } catch (error) {
      if (isMissingFile(error)) {
        return null
      }

      throw error
    }
  }

  private async loadTranscriptLog(sessionId: string): Promise<Message[]> {
    try {
      const text = await readFile(this.getTranscriptLogPath(sessionId), 'utf8')
      return text
        .split('\n')
        .filter(line => line.length > 0)
        .map(parseTranscriptLogLine)
    } catch (error) {
      if (isMissingFile(error)) {
        return []
      }

      throw error
    }
  }
}

const metadataSuffix = '.meta.json'

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

function buildMetadata(record: StoredSession): StoredSessionMetadata {
  const { summary, summarySourceRole } = summarizeTranscript(record.transcript)
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: record.transcript.length,
    summary,
    summarySourceRole,
  }
}

function summarizeTranscript(
  messages: readonly Message[],
): { summary: string; summarySourceRole?: Message['role'] } {
  const preferredMessage =
    [...messages].reverse().find(message => message.role === 'user') ??
    [...messages].reverse().find(message => message.role === 'assistant') ??
    messages[messages.length - 1]

  if (!preferredMessage) {
    return { summary: '(empty session)' }
  }

  return {
    summary: summarizeMessageText(preferredMessage.text),
    summarySourceRole: preferredMessage.role,
  }
}

function applyMessageToMetadata(
  metadata: StoredSessionMetadata,
  message: Message,
): StoredSessionMetadata {
  const { role } = message
  const { summarySourceRole } = metadata
  const shouldReplaceSummary =
    role === 'user' ||
    (role === 'assistant' && summarySourceRole !== 'user') ||
    ((role === 'tool' || role === 'system') &&
      summarySourceRole !== 'user' &&
      summarySourceRole !== 'assistant')

  return {
    ...metadata,
    messageCount: metadata.messageCount + 1,
    summary: shouldReplaceSummary
      ? summarizeMessageText(message.text)
      : metadata.summary,
    summarySourceRole: shouldReplaceSummary
      ? message.role
      : metadata.summarySourceRole,
  }
}

function summarizeMessageText(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) {
    return '(empty session)'
  }

  return compact.length > 80 ? `${compact.slice(0, 79)}…` : compact
}

function serializeTranscriptLog(messages: readonly Message[]): string {
  return messages
    .map(message => JSON.stringify(createTranscriptMessageRecord(message)))
    .join('\n')
    .concat(messages.length > 0 ? '\n' : '')
}

function createTranscriptMessageRecord(
  message: Message,
): SessionTranscriptMessageRecordV1 {
  return {
    type: 'message',
    version: 1,
    message,
  }
}

function parseTranscriptLogLine(line: string): Message {
  const parsed = JSON.parse(line) as unknown

  if (isTranscriptMessageRecordV1(parsed)) {
    return parsed.message
  }

  if (isMessage(parsed)) {
    // Backward compatibility for session logs written before typed envelopes.
    return parsed
  }

  throw new Error('Invalid session transcript record')
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

function isTranscriptMessageRecordV1(
  value: unknown,
): value is SessionTranscriptMessageRecordV1 {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'message' &&
    'version' in value &&
    value.version === 1 &&
    'message' in value &&
    isMessage(value.message)
  )
}

function isMessage(value: unknown): value is Message {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'role' in value &&
    (value.role === 'system' ||
      value.role === 'user' ||
      value.role === 'assistant' ||
      value.role === 'tool') &&
    'text' in value &&
    typeof value.text === 'string' &&
    (!('name' in value) ||
      value.name === undefined ||
      typeof value.name === 'string') &&
    (!('artifact' in value) ||
      value.artifact === undefined ||
      isMessageArtifact(value.artifact))
  )
}

function isMessageArtifact(value: unknown): value is NonNullable<Message['artifact']> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'tool_result' &&
    'relativePath' in value &&
    typeof value.relativePath === 'string' &&
    'byteLength' in value &&
    typeof value.byteLength === 'number'
  )
}
