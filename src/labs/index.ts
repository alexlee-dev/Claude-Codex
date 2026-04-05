import { lab1ToolRegistration } from './lab1/tools/index.ts'
import { lab2ToolRegistration } from './lab2/tools/index.ts'
import { lab3ToolRegistration } from './lab3/tools/index.ts'
import { lab4ToolRegistration } from './lab4/tools/index.ts'

export const labToolRegistrations = [
  lab1ToolRegistration,
  lab2ToolRegistration,
  lab3ToolRegistration,
  lab4ToolRegistration,
] as const
