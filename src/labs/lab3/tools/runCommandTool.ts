import type { Tool } from '../../../core/tools/ToolRegistry.ts'
import {
  execCommand,
  expectString,
  expectStringArray,
  formatCommandOutput,
  isExecFailure,
  isExecNotFound,
  validateAllowedCommand,
} from './shared.ts'

export function createRunCommandTool(): Tool {
  return {
    name: 'run_command',
    description:
      'Run a small allowlist of safe repository commands: bun test or cat <path>.',
    inputHint: '{"command":"bun","args":["test"]}',
    async run(input, ctx) {
      const command = expectString(input.command, 'command')
      const args = expectStringArray(input.args ?? [], 'args')
      const allowed = validateAllowedCommand(command, args, ctx.cwd)

      try {
        const { stdout, stderr } = await execCommand({
          command: allowed.command,
          execArgs: allowed.args,
          cwd: ctx.cwd,
        })

        return formatCommandOutput({
          command: allowed.display,
          stdout,
          stderr,
          exitCode: 0,
        })
      } catch (error) {
        if (isExecNotFound(error)) {
          throw new Error(
            `${allowed.command} is not installed or not available in PATH`,
          )
        }

        const message = isExecFailure(error)
          ? formatCommandOutput({
              command: allowed.display,
              stdout: error.stdout,
              stderr: error.stderr,
              exitCode:
                typeof error.code === 'number' ? error.code : 'unknown',
            })
          : `Command failed: ${String(error)}`

        throw new Error(message)
      }
    },
  }
}
