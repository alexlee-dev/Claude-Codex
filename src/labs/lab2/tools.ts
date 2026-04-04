import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { isAbsolute, relative, resolve } from 'node:path'

export interface ToolContext {
  cwd: string
}

export interface Tool {
  name: string
  description: string
  inputHint: string
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<string>
}

export function getBuiltinTools(): Tool[] {
  return [createReadFileTool(), createSearchCodeTool()]
}

export function renderToolCatalog(tools: readonly Tool[]): string {
  return tools
    .map(
      tool =>
        `- ${tool.name}: ${tool.description} Input shape: ${tool.inputHint}`,
    )
    .join('\n')
}

function createReadFileTool(): Tool {
  return {
    name: 'read_file',
    description: 'Read a UTF-8 text file inside the current repository.',
    inputHint: '{"path":"relative/path/to/file.ts"}',
    async run(input, ctx) {
      const path = expectString(input.path, 'path')
      const resolvedPath = resolvePathWithinCwd(path, ctx.cwd)
      const text = await readFile(resolvedPath, 'utf8')

      return [`FILE: ${relative(ctx.cwd, resolvedPath) || '.'}`, text].join(
        '\n\n',
      )
    },
  }
}

function createSearchCodeTool(): Tool {
  return {
    name: 'search_code',
    description:
      'Search repository text with ripgrep and return matching lines.',
    inputHint: '{"query":"QueryEngine|tool|MCP"}',
    async run(input, ctx) {
      const query = expectString(input.query, 'query').trim()
      if (!query) {
        throw new Error('query must not be empty')
      }

      try {
        const stdout = await runRipgrep(query, ctx.cwd)
        const trimmed = stdout.trim()
        if (!trimmed) {
          return `No matches found for query: ${query}`
        }

        return trimmed
      } catch (error) {
        if (isExecNotFound(error)) {
          throw new Error('rg is not installed or not available in PATH')
        }

        if (isRipgrepNoMatch(error)) {
          return `No matches found for query: ${query}`
        }

        throw error
      }
    },
  }
}

function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`)
  }

  return value
}

function resolvePathWithinCwd(path: string, cwd: string): string {
  const resolvedPath = resolve(cwd, path)
  const rel = relative(cwd, resolvedPath)

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path must stay inside cwd: ${path}`)
  }

  return resolvedPath
}

async function runRipgrep(query: string, cwd: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn('rg', ['-n', '--hidden', '--glob', '!.git', query, '.'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', chunk => {
      stdout += String(chunk)
    })

    child.stderr?.on('data', chunk => {
      stderr += String(chunk)
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve(stdout)
        return
      }

      if (code === 1) {
        const error = new Error('ripgrep reported no matches') as Error & {
          code: number
        }
        error.code = 1
        reject(error)
        return
      }

      reject(new Error(stderr.trim() || `rg exited with code ${code ?? 'unknown'}`))
    })
  })
}

function isRipgrepNoMatch(
  error: unknown,
): error is Error & { code: number | string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 1
  )
}

function isExecNotFound(
  error: unknown,
): error is Error & { code: number | string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
