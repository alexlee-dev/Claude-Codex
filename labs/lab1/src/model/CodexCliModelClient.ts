import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import type { ModelClient, ModelRequest, ModelResponse } from '../types/model.ts'
import type { Message } from '../types/message.ts'
import { createAssistantMessage } from '../utils/messageFactory.ts'

export interface CodexDebugEvent {
  source: 'stdout' | 'stderr'
  line: string
}

export interface CodexCliModelClientOptions {
  defaultModel?: string
  reasoningEffort?: 'low' | 'medium' | 'high' | 'none'
  codexBin?: string
  debug?: boolean
  onDebugEvent?: (event: CodexDebugEvent) => void
}

export class CodexCliModelClient implements ModelClient {
  private readonly defaultModel?: string
  private readonly reasoningEffort: 'low' | 'medium' | 'high' | 'none'
  private readonly codexBin: string
  private readonly debug: boolean
  private readonly onDebugEvent?: (event: CodexDebugEvent) => void

  constructor(options: CodexCliModelClientOptions = {}) {
    this.defaultModel = options.defaultModel
    this.reasoningEffort = options.reasoningEffort ?? 'low'
    this.codexBin = options.codexBin ?? 'bun'
    this.debug = options.debug ?? false
    this.onDebugEvent = options.onDebugEvent
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const tempDir = await mkdtemp(join(tmpdir(), 'codex-lab1-'))
    const outputPath = join(tempDir, 'last-message.txt')

    const prompt = serializeTranscript(request.messages, request.systemPrompt)
    const args = [
      'x',
      'codex',
      'exec',
      '--skip-git-repo-check',
      '--config',
      `model_reasoning_effort="${this.reasoningEffort}"`,
      '--sandbox',
      'read-only',
      '--color',
      'never',
      '--output-last-message',
      outputPath,
      '--ephemeral',
    ]

    if (request.model ?? this.defaultModel) {
      args.push('--model', request.model ?? this.defaultModel!)
    }

    args.push(prompt)

    try {
      await runCommand({
        cmd: this.codexBin,
        args,
        cwd: process.cwd(),
        onDebugEvent: this.debug ? this.onDebugEvent : undefined,
      })

      const text = (await readFile(outputPath, 'utf8')).trim() || '(empty response)'
      return {
        message: createAssistantMessage(text),
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

function serializeTranscript(
  messages: readonly Message[],
  systemPrompt?: string,
): string {
  const sections: string[] = []

  if (systemPrompt) {
    sections.push(`<system>\n${systemPrompt}\n</system>`)
  }

  for (const message of messages) {
    sections.push(`<${message.role}>\n${message.text}\n</${message.role}>`)
  }

  sections.push(
    [
      'Continue the conversation as the assistant.',
      'This local lab currently has no tool interface.',
      'Return only the assistant reply text.',
    ].join('\n'),
  )

  return sections.join('\n\n')
}

async function runCommand(args: {
  cmd: string
  args: string[]
  cwd: string
  onDebugEvent?: (event: CodexDebugEvent) => void
}): Promise<void> {
  const debugEnabled = Boolean(args.onDebugEvent)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(args.cmd, args.args, {
      cwd: args.cwd,
      stdio: ['ignore', debugEnabled ? 'pipe' : 'ignore', 'pipe'],
      env: process.env,
    })

    let stderr = ''
    let stdoutBuffer = ''
    let stderrBuffer = ''

    if (debugEnabled && child.stdout) {
      child.stdout.on('data', chunk => {
        stdoutBuffer += String(chunk)
        stdoutBuffer = flushDebugLines(stdoutBuffer, 'stdout', args.onDebugEvent)
      })
    }

    const stderrStream = child.stderr
    if (stderrStream) {
      stderrStream.on('data', chunk => {
        const text = String(chunk)
        stderr += text

        if (debugEnabled) {
          stderrBuffer += text
          stderrBuffer = flushDebugLines(stderrBuffer, 'stderr', args.onDebugEvent)
        }
      })
    }

    child.on('error', reject)
    child.on('close', code => {
      if (debugEnabled) {
        flushTrailingDebugLine(stdoutBuffer, 'stdout', args.onDebugEvent)
        flushTrailingDebugLine(stderrBuffer, 'stderr', args.onDebugEvent)
      }

      if (code === 0) {
        resolve()
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

function flushDebugLines(
  buffer: string,
  source: 'stdout' | 'stderr',
  onDebugEvent?: (event: CodexDebugEvent) => void,
): string {
  let remainder = buffer

  while (true) {
    const newlineIndex = remainder.indexOf('\n')
    if (newlineIndex === -1) {
      return remainder
    }

    const line = remainder.slice(0, newlineIndex).trim()
    remainder = remainder.slice(newlineIndex + 1)

    if (!line) {
      continue
    }

    onDebugEvent?.(buildDebugEvent(source, line))
  }
}

function flushTrailingDebugLine(
  buffer: string,
  source: 'stdout' | 'stderr',
  onDebugEvent?: (event: CodexDebugEvent) => void,
): void {
  const line = buffer.trim()
  if (!line) {
    return
  }

  onDebugEvent?.(buildDebugEvent(source, line))
}

function buildDebugEvent(
  source: 'stdout' | 'stderr',
  line: string,
): CodexDebugEvent {
  return {
    source,
    line,
  }
}
