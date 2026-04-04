import {
  createToolAgentQuery,
  type ToolAgentQueryArgs as QueryArgs,
} from '../../core/query/createToolAgentQuery.ts'

export type { QueryArgs }

export const query = createToolAgentQuery({
  defaultMaxSteps: 4,
  stepLimitMessage:
    'I could not finish within the lab2 step limit. Please narrow the request.',
})
