import { spawn } from 'node:child_process'
import { basename } from 'node:path'
import type { CodexDebugEvent } from './codexDebug.ts'
import {
  flushLines,
  flushTrailingLine,
} from './codexDebug.ts'

export interface RunCodexExecOptions {
  prompt: string
  model?: string
  reasoningEffort?: 'low' | 'medium' | 'high' | 'none'
  codexBin?: string
  cwd?: string
  onDebugEvent?: (event: CodexDebugEvent) => void
}

export async function runCodexExec(
  options: RunCodexExecOptions,
): Promise<string> {
  const command = buildCodexCommand(options)

  if (options.model) {
    command.args.push('--model', options.model)
  }

  command.args.push('-')

  return await runCommand({
    cmd: command.cmd,
    args: command.args,
    cwd: options.cwd ?? process.cwd(),
    stdinText: options.prompt,
    onDebugEvent: options.onDebugEvent,
  })
}

async function runCommand(args: {
  cmd: string
  args: string[]
  cwd: string
  stdinText?: string
  onDebugEvent?: (event: CodexDebugEvent) => void
}): Promise<string> {
  const debugEnabled = Boolean(args.onDebugEvent)

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(args.cmd, args.args, {
      cwd: args.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    let stderr = ''
    let stdoutBuffer = ''
    let stderrBuffer = ''
    let lastAssistantText: string | undefined

    if (child.stdout) {
      child.stdout.on('data', chunk => {
        stdoutBuffer += String(chunk)
        stdoutBuffer = flushLines(stdoutBuffer, line => {
          if (debugEnabled) {
            args.onDebugEvent?.({
              source: 'stdout',
              line,
            })
          }

          const text = extractAssistantMessageText(line)
          if (text !== undefined && text.trim()) {
            lastAssistantText = text
          }
        })
      })
    }

    if (child.stderr) {
      child.stderr.on('data', chunk => {
        const text = String(chunk)
        stderr += text

        if (debugEnabled) {
          stderrBuffer += text
          stderrBuffer = flushLines(stderrBuffer, line => {
            args.onDebugEvent?.({
              source: 'stderr',
              line,
            })
          })
        }
      })
    }

    if (child.stdin) {
      child.stdin.end(args.stdinText ?? '')
    }

    child.on('error', reject)
    child.on('close', code => {
      flushTrailingLine(stdoutBuffer, line => {
        if (debugEnabled) {
          args.onDebugEvent?.({
            source: 'stdout',
            line,
          })
        }

        const text = extractAssistantMessageText(line)
        if (text !== undefined && text.trim()) {
          lastAssistantText = text
        }
      })

      if (debugEnabled) {
        flushTrailingLine(stderrBuffer, line => {
          args.onDebugEvent?.({
            source: 'stderr',
            line,
          })
        })
      }

      if (code === 0) {
        resolve(lastAssistantText?.trim() || '(empty response)')
        return
      }

      reject(
        new Error(
          stderr.trim() || `Codex CLI exited with code ${code ?? 'unknown'}`,
        ),
      )
    })
  })
}

function buildCodexCommand(options: RunCodexExecOptions): {
  cmd: string
  args: string[]
} {
  const cmd = options.codexBin ?? 'bun'
  const execArgs = [
    '--skip-git-repo-check',
    '--config',
    `model_reasoning_effort="${options.reasoningEffort ?? 'low'}"`,
    '--sandbox',
    'read-only',
    '--color',
    'never',
    '--json',
    '--ephemeral',
  ]

  if (isBunCommand(cmd)) {
    return {
      cmd,
      args: ['x', 'codex', 'exec', ...execArgs],
    }
  }

  return {
    cmd,
    args: ['exec', ...execArgs],
  }
}

function isBunCommand(cmd: string): boolean {
  const name = basename(cmd).toLowerCase()
  return name === 'bun' || name === 'bun.exe'
}

function extractAssistantMessageText(line: string): string | undefined {
  let parsed: unknown

  try {
    parsed = JSON.parse(line)
  } catch {
    return undefined
  }

  if (!isRecord(parsed) || parsed.type !== 'item.completed') {
    return undefined
  }

  const item = parsed.item
  if (!isRecord(item) || item.type !== 'agent_message') {
    return undefined
  }

  if (typeof item.text === 'string') {
    return item.text
  }

  if (!Array.isArray(item.content)) {
    return undefined
  }

  const parts = item.content.flatMap(part => {
    if (typeof part === 'string') {
      return [part]
    }

    if (!isRecord(part) || typeof part.text !== 'string') {
      return []
    }

    return [part.text]
  })

  return parts.length > 0 ? parts.join('') : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
