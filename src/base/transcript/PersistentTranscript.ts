import type { Transcript } from '../types/transcript.ts'

export interface PersistableTranscript<TMessage> extends Transcript<TMessage> {
  flush(): Promise<void>
}

export class PersistentTranscript<TMessage>
  implements PersistableTranscript<TMessage>
{
  private readonly messages: TMessage[]
  private readonly persist: (messages: readonly TMessage[]) => Promise<void>
  private pendingWrite: Promise<void> = Promise.resolve()
  private persistedCount: number

  constructor(options: {
    initialMessages?: readonly TMessage[]
    persist: (messages: readonly TMessage[]) => Promise<void>
  }) {
    this.messages = [...(options.initialMessages ?? [])]
    this.persist = options.persist
    this.persistedCount = this.messages.length
  }

  getMessages(): readonly TMessage[] {
    return this.messages
  }

  append(message: TMessage): void {
    this.messages.push(message)
    this.pendingWrite = this.pendingWrite
      .catch(() => undefined)
      .then(async () => {
        const pendingMessages = this.messages.slice(this.persistedCount)
        if (pendingMessages.length === 0) {
          return
        }

        await this.persist(pendingMessages)
        this.persistedCount += pendingMessages.length
      })
  }

  async flush(): Promise<void> {
    await this.pendingWrite
  }
}
