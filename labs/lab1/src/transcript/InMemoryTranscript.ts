import type { Message } from '../types/message.ts'
import type { Transcript } from '../types/transcript.ts'

export class InMemoryTranscript implements Transcript {
  constructor(private readonly messages: Message[] = []) {}

  getMessages(): readonly Message[] {
    return this.messages
  }

  append(message: Message): void {
    this.messages.push(message)
  }
}
