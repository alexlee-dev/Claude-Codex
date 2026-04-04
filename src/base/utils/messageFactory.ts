import { randomUUID } from 'node:crypto'
import type { Message } from '../types/message.ts'

export function createUserMessage(text: string): Message {
  return {
    id: randomUUID(),
    role: 'user',
    text,
  }
}

export function createAssistantMessage(text: string): Message {
  return {
    id: randomUUID(),
    role: 'assistant',
    text,
  }
}

export function createSystemMessage(text: string): Message {
  return {
    id: randomUUID(),
    role: 'system',
    text,
  }
}

export function createToolMessage(name: string, text: string): Message {
  return {
    id: randomUUID(),
    role: 'tool',
    name,
    text,
  }
}
