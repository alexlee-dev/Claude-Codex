import type { ModelClient, ModelRequest, ModelResponse } from '../types/model.ts'
import type { CodexDebugEvent } from './codexDebug.ts'
import { runCodexExec } from './runCodexExec.ts'

export type { CodexDebugEvent } from './codexDebug.ts'

export interface CodexCliModelClientOptions<TMessage> {
  serializeTranscript: (
    messages: readonly TMessage[],
    systemPrompt?: string,
  ) => string
  createAssistantMessage: (text: string) => TMessage
  defaultModel?: string
  reasoningEffort?: 'low' | 'medium' | 'high' | 'none'
  codexBin?: string
  debug?: boolean
  onDebugEvent?: (event: CodexDebugEvent) => void
}

export class CodexCliModelClient<TMessage = unknown>
  implements ModelClient<TMessage>
{
  private readonly serializeTranscript: (
    messages: readonly TMessage[],
    systemPrompt?: string,
  ) => string
  private readonly createAssistantMessage: (text: string) => TMessage
  private readonly defaultModel?: string
  private readonly reasoningEffort: 'low' | 'medium' | 'high' | 'none'
  private readonly codexBin: string
  private readonly debug: boolean
  private readonly onDebugEvent?: (event: CodexDebugEvent) => void

  constructor(options: CodexCliModelClientOptions<TMessage>) {
    this.serializeTranscript = options.serializeTranscript
    this.createAssistantMessage = options.createAssistantMessage
    this.defaultModel = options.defaultModel
    this.reasoningEffort = options.reasoningEffort ?? 'low'
    this.codexBin = options.codexBin ?? 'bun'
    this.debug = options.debug ?? false
    this.onDebugEvent = options.onDebugEvent
  }

  async generate(
    request: ModelRequest<TMessage>,
  ): Promise<ModelResponse<TMessage>> {
    const text = await runCodexExec({
      prompt: this.serializeTranscript(request.messages, request.systemPrompt),
      model: request.model ?? this.defaultModel,
      reasoningEffort: this.reasoningEffort,
      codexBin: this.codexBin,
      cwd: process.cwd(),
      onDebugEvent: this.debug ? this.onDebugEvent : undefined,
    })

    return {
      message: this.createAssistantMessage(text),
    }
  }
}
