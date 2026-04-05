import { spawn } from 'node:child_process'

export interface SpawnCliSessionArgs {
  cwd: string
  entrypoint: string
  env?: NodeJS.ProcessEnv
  args?: string[]
}

export interface CliSession {
  stdout: string
  stderr: string
  write(input: string): void
  waitForOutput(predicate: () => boolean, timeoutMs?: number): Promise<void>
  waitForExit(timeoutMs?: number): Promise<number | null>
  kill(): void
}

export function spawnCliSession(args: SpawnCliSessionArgs): CliSession {
  const childArgs = [
    'run',
    args.entrypoint,
    ...(args.args && args.args.length > 0 ? ['--', ...args.args] : []),
  ]

  const child = spawn(process.execPath, childArgs, {
    cwd: args.cwd,
    env: {
      ...process.env,
      ...args.env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdout += chunk
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
  })

  return {
    get stdout() {
      return stdout
    },
    get stderr() {
      return stderr
    },
    write(input: string) {
      child.stdin.write(input)
    },
    async waitForOutput(
      predicate: () => boolean,
      timeoutMs: number = 2_000,
    ): Promise<void> {
      const startedAt = Date.now()

      while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) {
          throw new Error('timed out waiting for expected CLI output')
        }

        await Bun.sleep(10)
      }
    },
    async waitForExit(timeoutMs: number = 10_000): Promise<number | null> {
      return await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill()
          reject(new Error('CLI session timed out'))
        }, timeoutMs)

        child.on('error', error => {
          clearTimeout(timer)
          reject(error)
        })

        child.on('close', code => {
          clearTimeout(timer)
          resolve(code)
        })
      })
    },
    kill() {
      child.kill()
    },
  }
}
