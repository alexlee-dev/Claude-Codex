import type { AgentEvent } from '../../base/types/agent.ts'
import type { Message } from '../../base/types/message.ts'
import type { ModelClient } from '../../base/types/model.ts'
import type { Transcript } from '../../base/types/transcript.ts'

export interface QueryArgs {
  transcript: Transcript<Message>
  modelClient: ModelClient<Message>
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
