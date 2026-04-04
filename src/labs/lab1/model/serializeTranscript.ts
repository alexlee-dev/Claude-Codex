import type { Message } from '../../../base/types/message.ts'

export function serializeTranscript(
  messages: readonly Message[],
  systemPrompt?: string,
): string {
  const sections: string[] = []

  if (systemPrompt) {
    sections.push(`<system>\n${systemPrompt}\n</system>`)
  }

  for (const message of messages) {
    sections.push(`<${message.role}>\n${message.text}\n</${message.role}>`)
  }

  sections.push(
    [
      'Continue the conversation as the assistant.',
      'This local lab currently has no tool interface.',
      'Return only the assistant reply text.',
    ].join('\n'),
  )

  return sections.join('\n\n')
}
