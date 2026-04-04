import type {
  ModelClient,
  ModelRequest,
  ModelResponse,
} from '../types/model.ts'

export interface MockModelClientOptions<TMessage> {
  responses: string[]
  createAssistantMessage: (text: string) => TMessage
}

export class MockModelClient<TMessage = unknown>
  implements ModelClient<TMessage>
{
  private readonly responses: string[]
  private readonly createAssistantMessage: (text: string) => TMessage

  constructor(options: MockModelClientOptions<TMessage>) {
    this.responses = [...options.responses]
    this.createAssistantMessage = options.createAssistantMessage
  }

  async generate(
    _request: ModelRequest<TMessage>,
  ): Promise<ModelResponse<TMessage>> {
    const text = this.responses.shift() ?? '(missing mock response)'

    return {
      message: this.createAssistantMessage(text),
    }
  }
}

export function parseMockResponsesFromEnv(envVarName: string): string[] {
  const raw = process.env[envVarName]
  if (!raw) {
    return ['(missing mock response)']
  }

  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || !parsed.every(item => typeof item === 'string')) {
    throw new Error(`${envVarName} must be a JSON array of strings`)
  }

  return parsed
}
