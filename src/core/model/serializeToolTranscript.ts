import type { Message } from '../../base/types/message.ts'

export function serializeToolTranscript(
  messages: readonly Message[],
  systemPrompt?: string,
): string {
  const sections: string[] = []

  if (systemPrompt) {
    sections.push(`<system>\n${systemPrompt}\n</system>`)
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      sections.push(
        `<tool name="${message.name ?? 'tool'}">\n${message.text}\n</tool>`,
      )
      continue
    }

    sections.push(`<${message.role}>\n${message.text}\n</${message.role}>`)
  }

  sections.push(
    [
      'Decide the next best assistant action.',
      'Return only one JSON object and nothing else.',
    ].join('\n'),
  )

  return sections.join('\n\n')
}
