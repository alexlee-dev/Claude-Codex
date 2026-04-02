export interface AgentEventMap {
  assistant_message: {
    text: string
  }
}

export type AgentEvent = {
  [K in keyof AgentEventMap]: {
    type: K
    payload: AgentEventMap[K]
  }
}[keyof AgentEventMap]
