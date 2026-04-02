import type { Message } from './message.ts'

export interface Transcript {
  getMessages(): readonly Message[]
  append(message: Message): void
}
