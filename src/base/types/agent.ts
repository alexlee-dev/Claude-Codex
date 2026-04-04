export interface AgentEventMap {
  assistant_message: {
    text: string
  }
  tool_call: {
    tool: string
    input: Record<string, unknown>
  }
  tool_result: {
    tool: string
    output: string
    isError: boolean
  }
}

export type AgentEvent = {
  [K in keyof AgentEventMap]: {
    type: K
    payload: AgentEventMap[K]
  }
}[keyof AgentEventMap]
