import {
  createToolAgentQuery,
  type ToolAgentQueryArgs as QueryArgs,
} from '../../core/query/createToolAgentQuery.ts'

export type { QueryArgs }

export const query = createToolAgentQuery({
  defaultMaxSteps: 6,
  stepLimitMessage:
    'I could not finish within the lab3 step limit. Please narrow the request.',
})
