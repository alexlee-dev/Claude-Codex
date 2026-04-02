import type { AgentEvent } from './types/agent.ts'
import type { ModelClient } from './types/model.ts'
import type { Transcript } from './types/transcript.ts'
import { query } from './query.ts'
import { createUserMessage } from './utils/messageFactory.ts'

export interface QueryEngineOptions {
  transcript: Transcript
  modelClient: ModelClient
  systemPrompt?: string
  model?: string
}

export class QueryEngine {
  private readonly transcript: Transcript
  private readonly modelClient: ModelClient
  private readonly systemPrompt?: string
  private readonly model?: string

  constructor(options: QueryEngineOptions) {
    this.transcript = options.transcript
    this.modelClient = options.modelClient
    this.systemPrompt = options.systemPrompt
    this.model = options.model
  }

  getTranscript(): Transcript {
    return this.transcript
  }

  async *submitUserText(text: string): AsyncGenerator<AgentEvent, void> {
    this.transcript.append(createUserMessage(text))

    yield* query({
      transcript: this.transcript,
      modelClient: this.modelClient,
      systemPrompt: this.systemPrompt,
      model: this.model,
    })
  }
}
