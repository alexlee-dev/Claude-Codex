import type { LabToolRegistration } from '../../../core/tools/ToolRegistry.ts'
import { createReadFileTool } from './readFileTool.ts'
import { createSearchCodeTool } from './searchCodeTool.ts'

export const lab2ToolRegistration: LabToolRegistration = {
  lab: 2,
  tools: [createReadFileTool(), createSearchCodeTool()],
}

export { createReadFileTool } from './readFileTool.ts'
export { createSearchCodeTool } from './searchCodeTool.ts'
