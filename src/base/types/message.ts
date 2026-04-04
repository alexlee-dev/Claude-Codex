export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface Message {
  id: string
  role: Role
  text: string
  name?: string
}
