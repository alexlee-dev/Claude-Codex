import type { LabToolRegistration } from '../../../core/tools/ToolRegistry.ts'
import { createReplaceInFileTool } from './replaceInFileTool.ts'
import { createRunCommandTool } from './runCommandTool.ts'

export const lab3ToolRegistration: LabToolRegistration = {
  lab: 3,
  tools: [createReplaceInFileTool(), createRunCommandTool()],
}

export { createReplaceInFileTool } from './replaceInFileTool.ts'
export { createRunCommandTool } from './runCommandTool.ts'
