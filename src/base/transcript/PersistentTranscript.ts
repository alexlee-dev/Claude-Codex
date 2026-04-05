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

  constructor(options: {
    initialMessages?: readonly TMessage[]
    persist: (messages: readonly TMessage[]) => Promise<void>
  }) {
    this.messages = [...(options.initialMessages ?? [])]
    this.persist = options.persist
  }

  getMessages(): readonly TMessage[] {
    return this.messages
  }

  append(message: TMessage): void {
    this.messages.push(message)
    const snapshot = [...this.messages]
    this.pendingWrite = this.pendingWrite
      .catch(() => undefined)
      .then(() => this.persist(snapshot))
  }

  async flush(): Promise<void> {
    await this.pendingWrite
  }
}
