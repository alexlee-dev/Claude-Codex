import { stdout as defaultOutput } from 'node:process'

export interface StartupCommandContext {
  argv: readonly string[]
  cwd: string
  output: NodeJS.WriteStream
  env: NodeJS.ProcessEnv
}

export type StartupCommandResult<TValue = unknown> =
  | {
      type: 'continue'
      value?: TValue
    }
  | {
      type: 'exit'
      code?: number
    }

export interface StartupCommand<TValue = unknown> {
  name: string
  aliases?: readonly string[]
  description: string
  run(
    ctx: StartupCommandContext,
  ): Promise<StartupCommandResult<TValue>> | StartupCommandResult<TValue>
}

export interface LabStartupCommandRegistration {
  lab: number
  commands: readonly StartupCommand[]
}

export class StartupCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StartupCommandError'
  }
}

export function failStartupCommand(message: string): never {
  throw new StartupCommandError(message)
}

export class StartupCommandRegistry {
  private readonly registrations: readonly LabStartupCommandRegistration[]

  constructor(registrations: readonly LabStartupCommandRegistration[]) {
    this.registrations = [...registrations].sort((left, right) => left.lab - right.lab)
  }

  getCommandsForLab(targetLab: number): StartupCommand[] {
    const merged = new Map<string, StartupCommand>()

    for (const registration of this.registrations) {
      if (registration.lab > targetLab) {
        continue
      }

      for (const command of registration.commands) {
        merged.set(command.name, command)
      }
    }

    return [...merged.values()]
  }

  findCommandForLab(targetLab: number, name: string): StartupCommand | undefined {
    return this.getCommandsForLab(targetLab).find(command =>
      [command.name, ...(command.aliases ?? [])].includes(name),
    )
  }
}

export async function runStartupCommand<TValue = unknown>(args: {
  labNumber: number
  argv: readonly string[]
  registrations: readonly LabStartupCommandRegistration[]
  cwd?: string
  output?: NodeJS.WriteStream
  env?: NodeJS.ProcessEnv
}): Promise<
  | {
      handled: false
    }
  | {
      handled: true
      command: StartupCommand<TValue>
      result: StartupCommandResult<TValue>
    }
> {
  const [name] = args.argv
  if (!name) {
    return { handled: false }
  }

  const registry = new StartupCommandRegistry(args.registrations)
  const command = registry.findCommandForLab(args.labNumber, name) as
    | StartupCommand<TValue>
    | undefined

  if (!command) {
    const available = registry
      .getCommandsForLab(args.labNumber)
      .map(candidate => candidate.name)
      .sort()
      .join(', ')

    throw new StartupCommandError(
      `Unknown startup command: ${name}. Available commands: ${available || '(none)'}.`,
    )
  }

  const result = await command.run({
    argv: args.argv,
    cwd: args.cwd ?? process.cwd(),
    output: args.output ?? defaultOutput,
    env: args.env ?? process.env,
  })

  return {
    handled: true,
    command,
    result,
  }
}
