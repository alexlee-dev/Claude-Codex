export interface ToolContext {
  cwd: string
}

export interface Tool {
  name: string
  description: string
  inputHint: string
  requiresApproval?: boolean
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<string>
}

export interface LabToolRegistration {
  lab: number
  tools: readonly Tool[]
}

export class ToolRegistry {
  private readonly registrations: readonly LabToolRegistration[]

  constructor(registrations: readonly LabToolRegistration[]) {
    this.registrations = [...registrations].sort((left, right) => left.lab - right.lab)
  }

  getToolsForLab(targetLab: number): Tool[] {
    const merged = new Map<string, Tool>()

    for (const registration of this.registrations) {
      if (registration.lab > targetLab) {
        continue
      }

      for (const tool of registration.tools) {
        merged.set(tool.name, tool)
      }
    }

    return [...merged.values()]
  }
}

export function renderToolCatalog(
  tools: ReadonlyArray<{
    name: string
    description: string
    inputHint: string
  }>,
): string {
  return tools
    .map(
      tool =>
        `- ${tool.name}: ${tool.description} Input shape: ${tool.inputHint}`,
    )
    .join('\n')
}
