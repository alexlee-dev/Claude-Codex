import type { AgentEvent } from './types/agent.ts'
import type { ModelClient } from './types/model.ts'
import type { Transcript } from './types/transcript.ts'

export interface QueryArgs {
  transcript: Transcript
  modelClient: ModelClient
  systemPrompt?: string
  model?: string
}

export async function* query(
  args: QueryArgs,
): AsyncGenerator<AgentEvent, void> {
  const { transcript, modelClient, systemPrompt, model } = args

  const response = await modelClient.generate({
    systemPrompt,
    messages: transcript.getMessages(),
    model,
  })

  transcript.append(response.message)

  yield {
    type: 'assistant_message',
    payload: { text: response.message.text },
  }
}
