import {
  StartupCommandError,
  runStartupCommand,
  type StartupCommandResult,
} from '../core/cli/StartupCommandRegistry.ts'
import { stderr as defaultErrorOutput } from 'node:process'
import { labStartupCommandRegistrations } from './index.ts'

export async function runLabStartupCommand<TValue = unknown>(args: {
  labNumber: number
  argv?: readonly string[]
  cwd?: string
  output?: NodeJS.WriteStream
  errorOutput?: NodeJS.WriteStream
  env?: NodeJS.ProcessEnv
}): Promise<
  | {
      handled: false
    }
  | {
      handled: true
      result: StartupCommandResult<TValue>
    }
> {
  try {
    const startup = await runStartupCommand<TValue>({
      labNumber: args.labNumber,
      argv: args.argv ?? process.argv.slice(2),
      registrations: labStartupCommandRegistrations,
      cwd: args.cwd,
      output: args.output,
      env: args.env,
    })

    if (!startup.handled) {
      return startup
    }

    if (startup.result.type === 'exit' && startup.result.code !== undefined) {
      process.exitCode = startup.result.code
    }

    return {
      handled: true,
      result: startup.result,
    }
  } catch (error) {
    if (!(error instanceof StartupCommandError)) {
      throw error
    }

    ;(args.errorOutput ?? defaultErrorOutput).write(`error: ${error.message}\n`)
    process.exitCode = 1
    return {
      handled: true,
      result: { type: 'exit', code: 1 },
    }
  }
}
