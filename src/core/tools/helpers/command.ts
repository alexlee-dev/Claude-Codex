import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_MAX_COMMAND_BUFFER = 1024 * 1024

export async function runRipgrep(query: string, cwd: string): Promise<string> {
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

export function isRipgrepNoMatch(
  error: unknown,
): error is Error & { code: number | string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 1
  )
}

export async function execCommand(args: {
  command: string
  execArgs: string[]
  cwd: string
  maxBuffer?: number
}): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync(args.command, args.execArgs, {
    cwd: args.cwd,
    maxBuffer: args.maxBuffer ?? DEFAULT_MAX_COMMAND_BUFFER,
  })
}

export function isExecFailure(
  error: unknown,
): error is Error & {
  code: number | string
  stdout: string
  stderr: string
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'stdout' in error &&
    'stderr' in error
  )
}
