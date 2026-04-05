import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CliSession } from '../base/spawnCliSession.ts'
import { spawnCliSession } from '../base/spawnCliSession.ts'

const lab4Entrypoint = fileURLToPath(
  new URL('../../src/labs/lab4/repl/runRepl.ts', import.meta.url),
)
const activeSessions = new Set<CliSession>()
const tempDirs: string[] = []

afterEach(async () => {
  for (const session of activeSessions) {
    session.kill()
  }
  activeSessions.clear()

  await Promise.all(
    tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
  )
})

test('lab4 persists transcripts and session memory to disk', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lab4-functional-'))
  tempDirs.push(cwd)

  await mkdir(join(cwd, 'src'), { recursive: true })
  await writeFile(join(cwd, 'README.md'), 'hello world\n', 'utf8')

  const storageRoot = join(cwd, '.lab4-state')
  const session = spawnCliSession({
    cwd,
    entrypoint: lab4Entrypoint,
    env: {
      NO_COLOR: '1',
      LAB4_MODEL_BACKEND: 'mock',
      LAB4_SESSION_ID: 'demo-session',
      LAB4_STORAGE_ROOT: storageRoot,
      LAB4_MEMORY_MIN_MESSAGES: '2',
      LAB4_MEMORY_MIN_MESSAGES_BETWEEN_UPDATES: '1',
      LAB4_MEMORY_PRESERVE_RECENT_MESSAGES: '2',
      LAB4_MOCK_RESPONSES: JSON.stringify([
        '{"type":"tool_call","tool":"read_file","input":{"path":"README.md"}}',
        '{"type":"final","text":"I checked README.md and found the greeting."}',
      ]),
    },
  })
  activeSessions.add(session)

  await session.waitForOutput(() => session.stdout.includes('you> '))
  session.write('inspect the README greeting\n')

  await session.waitForOutput(() =>
    session.stdout.includes('tool:read_file> {"path":"README.md"}'),
  )
  await session.waitForOutput(() =>
    session.stdout.includes(
      'assistant> I checked README.md and found the greeting.',
    ),
  )

  session.write('/exit\n')
  const exitCode = await session.waitForExit()
  activeSessions.delete(session)

  expect(exitCode).toBe(0)

  const transcriptPath = join(storageRoot, 'sessions', 'demo-session.json')
  const memoryPath = join(storageRoot, 'session-memory', 'demo-session.json')
  const transcriptText = await readFile(transcriptPath, 'utf8')
  const memoryText = await readFile(memoryPath, 'utf8')

  expect(transcriptText).toContain('inspect the README greeting')
  expect(transcriptText).toContain('I checked README.md and found the greeting.')
  expect(memoryText).toContain('# Current State')
  expect(memoryText).toContain('inspect the README greeting')
  expect(memoryText).toContain('summarizedThroughMessageId')
})
