export type Role = 'system' | 'user' | 'assistant'

export interface Message {
  id: string
  role: Role
  text: string
}
