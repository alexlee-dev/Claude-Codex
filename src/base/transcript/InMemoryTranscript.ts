import type { Transcript } from '../types/transcript.ts'

export class InMemoryTranscript<TMessage = unknown>
  implements Transcript<TMessage>
{
  constructor(private readonly messages: TMessage[] = []) {}

  getMessages(): readonly TMessage[] {
    return this.messages
  }

  append(message: TMessage): void {
    this.messages.push(message)
  }
}
