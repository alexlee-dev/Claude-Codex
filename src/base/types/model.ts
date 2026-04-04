export interface ModelRequest<TMessage = unknown> {
  systemPrompt?: string
  messages: readonly TMessage[]
  model?: string
}

export interface ModelResponse<TMessage = unknown> {
  message: TMessage
}

export interface ModelClient<TMessage = unknown> {
  generate(request: ModelRequest<TMessage>): Promise<ModelResponse<TMessage>>
}
