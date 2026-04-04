import { afterEach, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import type { CliSession } from '../base/spawnCliSession.ts'
import { spawnCliSession } from '../base/spawnCliSession.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const activeSessions = new Set<CliSession>()

afterEach(() => {
  for (const session of activeSessions) {
    session.kill()
  }
  activeSessions.clear()
})

test('lab1 CLI supports a 3-turn conversation with the mock backend', async () => {
  const session = spawnCliSession({
    cwd: repoRoot,
    entrypoint: './src/labs/lab1/repl/runRepl.ts',
    env: {
      NO_COLOR: '1',
      LAB1_MODEL_BACKEND: 'mock',
      LAB1_MOCK_RESPONSES: JSON.stringify([
        'mock reply 1',
        'mock reply 2',
        'mock reply 3',
      ]),
    },
  })
  activeSessions.add(session)

  await session.waitForOutput(() => session.stdout.includes('you> '))
  session.write('/tools\n')

  await session.waitForOutput(() =>
    session.stdout.includes('No tools available.\n'),
  )
  session.write('hello\n')

  await session.waitForOutput(() =>
    session.stdout.includes('assistant> mock reply 1\nyou> '),
  )
  session.write('how are you?\n')

  await session.waitForOutput(() =>
    session.stdout.includes('assistant> mock reply 2\nyou> '),
  )
  session.write('goodbye\n')

  await session.waitForOutput(() =>
    session.stdout.includes('assistant> mock reply 3\nyou> '),
  )
  session.write('/exit\n')

  const exitCode = await session.waitForExit()

  activeSessions.delete(session)

  expect(exitCode).toBe(0)
  expect(session.stderr).toBe('')
  expect(session.stdout).toContain('Type /exit to quit. Type /tools to list tools.')
  expect(session.stdout).toContain('No tools available.')
  expect(session.stdout).toContain('assistant> mock reply 1')
  expect(session.stdout).toContain('assistant> mock reply 2')
  expect(session.stdout).toContain('assistant> mock reply 3')
  expect(session.stdout).toContain('bye')
})
