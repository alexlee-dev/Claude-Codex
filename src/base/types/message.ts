export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface MessageArtifact {
  kind: 'tool_result'
  relativePath: string
  byteLength: number
}

export interface Message {
  id: string
  role: Role
  text: string
  name?: string
  artifact?: MessageArtifact
}
