import { relative } from 'node:path'
import {
  expectBoolean,
  expectString,
  expectStringArray,
  isEnoent,
  isExecNotFound,
  resolvePathWithinCwd,
} from '../../../core/tools/helpers/common.ts'
import { execCommand, isExecFailure } from '../../../core/tools/helpers/command.ts'
import {
  countOccurrences,
  DEFAULT_MAX_TEXT_CHARS as MAX_TEXT_CHARS,
  truncateText,
} from '../../../core/tools/helpers/text.ts'

export {
  countOccurrences,
  execCommand,
  expectBoolean,
  expectString,
  expectStringArray,
  isEnoent,
  isExecFailure,
  isExecNotFound,
  MAX_TEXT_CHARS,
  resolvePathWithinCwd,
  truncateText,
}

export function formatCommandOutput(args: {
  command: string
  stdout: string
  stderr: string
  exitCode: number | string
}): string {
  const sections = [
    `COMMAND: ${args.command}`,
    `EXIT CODE: ${args.exitCode}`,
  ]

  const stdout = args.stdout.trim()
  if (stdout) {
    sections.push(`STDOUT:\n${truncateText(stdout, MAX_TEXT_CHARS)}`)
  }

  const stderr = args.stderr.trim()
  if (stderr) {
    sections.push(`STDERR:\n${truncateText(stderr, MAX_TEXT_CHARS)}`)
  }

  if (!stdout && !stderr) {
    sections.push('OUTPUT: (empty)')
  }

  return sections.join('\n\n')
}

export function validateAllowedCommand(
  command: string,
  args: string[],
  cwd: string,
): {
  command: string
  args: string[]
  display: string
} {
  if (command === 'bun' && arraysEqual(args, ['test'])) {
    return { command, args, display: 'bun test' }
  }

  if (command === 'cat' && args.length === 1) {
    const resolvedPath = resolvePathWithinCwd(args[0]!, cwd)
    const relativePath = relative(cwd, resolvedPath) || '.'
    return {
      command,
      args: [resolvedPath],
      display: `cat ${relativePath}`,
    }
  }

  throw new Error(
    'command is not allowed. Allowed commands are: bun test and cat <path>.',
  )
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}
