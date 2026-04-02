import type { Message } from './message.ts'

export interface ModelRequest {
  systemPrompt?: string
  messages: readonly Message[]
  model?: string
}

export interface ModelResponse {
  message: Message
}

export interface ModelClient {
  generate(request: ModelRequest): Promise<ModelResponse>
}
