import type { ModelClient } from '../../base/types/model.ts'
import type { Transcript } from '../../base/types/transcript.ts'

export type QueryFunction<
  TMessage,
  TEvent,
  TQueryOptions extends object = {},
> = (args: {
  transcript: Transcript<TMessage>
  modelClient: ModelClient<TMessage>
  systemPrompt?: string
  model?: string
} & TQueryOptions) => AsyncGenerator<TEvent, void>

export interface QueryEngineOptions<
  TMessage,
  TEvent,
  TQueryOptions extends object = {},
> {
  transcript: Transcript<TMessage>
  modelClient: ModelClient<TMessage>
  systemPrompt?: string
  model?: string
  query: QueryFunction<TMessage, TEvent, TQueryOptions>
  createUserMessage: (text: string) => TMessage
  queryOptions?: TQueryOptions
  afterSubmit?: (args: {
    submittedText: string
    transcript: Transcript<TMessage>
  }) => Promise<void>
}

export class QueryEngine<
  TMessage,
  TEvent,
  TQueryOptions extends object = {},
> {
  private readonly transcript: Transcript<TMessage>
  private readonly modelClient: ModelClient<TMessage>
  private readonly systemPrompt?: string
  private readonly model?: string
  private readonly query: QueryFunction<TMessage, TEvent, TQueryOptions>
  private readonly createUserMessage: (text: string) => TMessage
  private readonly queryOptions: TQueryOptions
  private readonly afterSubmit?:
    | ((args: {
        submittedText: string
        transcript: Transcript<TMessage>
      }) => Promise<void>)
    | undefined

  constructor(options: QueryEngineOptions<TMessage, TEvent, TQueryOptions>) {
    this.transcript = options.transcript
    this.modelClient = options.modelClient
    this.systemPrompt = options.systemPrompt
    this.model = options.model
    this.query = options.query
    this.createUserMessage = options.createUserMessage
    this.queryOptions = (options.queryOptions ?? {}) as TQueryOptions
    this.afterSubmit = options.afterSubmit
  }

  getTranscript(): Transcript<TMessage> {
    return this.transcript
  }

  async *submitUserText(text: string): AsyncGenerator<TEvent, void> {
    this.transcript.append(this.createUserMessage(text))

    yield* this.query({
      transcript: this.transcript,
      modelClient: this.modelClient,
      systemPrompt: this.systemPrompt,
      model: this.model,
      ...this.queryOptions,
    })

    await this.afterSubmit?.({
      submittedText: text,
      transcript: this.transcript,
    })
  }
}
