import { afterEach, expect, test } from 'bun:test'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
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

test('lab4 starts a new session by default and persists transcript + memory', async () => {
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

  const sessionFiles = await readdir(join(storageRoot, 'sessions'))
  expect(sessionFiles).toHaveLength(1)

  const sessionId = decodeURIComponent(sessionFiles[0]!.replace(/\.json$/, ''))
  expect(sessionId).toMatch(/^\d{8}T\d{9}Z-[a-f0-9]{12}$/)

  const transcriptPath = join(storageRoot, 'sessions', sessionFiles[0]!)
  const memoryPath = join(storageRoot, 'session-memory', sessionFiles[0]!)
  const transcriptText = await readFile(transcriptPath, 'utf8')
  const memoryText = await readFile(memoryPath, 'utf8')

  expect(transcriptText).toContain('inspect the README greeting')
  expect(transcriptText).toContain('I checked README.md and found the greeting.')
  expect(memoryText).toContain('# Current State')
  expect(memoryText).toContain('inspect the README greeting')
  expect(memoryText).toContain('summarizedThroughMessageId')
})

test('lab4 resume reuses the original session file', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lab4-resume-'))
  tempDirs.push(cwd)

  await mkdir(join(cwd, 'src'), { recursive: true })
  await writeFile(join(cwd, 'README.md'), 'hello world\n', 'utf8')

  const storageRoot = join(cwd, '.lab4-state')
  const sessionId = 'resume-target'

  const initialSession = spawnCliSession({
    cwd,
    entrypoint: lab4Entrypoint,
    env: {
      NO_COLOR: '1',
      LAB4_MODEL_BACKEND: 'mock',
      LAB4_SESSION_ID: sessionId,
      LAB4_STORAGE_ROOT: storageRoot,
      LAB4_MEMORY_MIN_MESSAGES: '2',
      LAB4_MEMORY_MIN_MESSAGES_BETWEEN_UPDATES: '1',
      LAB4_MEMORY_PRESERVE_RECENT_MESSAGES: '2',
      LAB4_MOCK_RESPONSES: JSON.stringify([
        '{"type":"final","text":"first turn complete"}',
      ]),
    },
  })
  activeSessions.add(initialSession)

  await initialSession.waitForOutput(() => initialSession.stdout.includes('you> '))
  initialSession.write('first request\n')
  await initialSession.waitForOutput(() =>
    initialSession.stdout.includes('assistant> first turn complete'),
  )
  initialSession.write('/exit\n')
  expect(await initialSession.waitForExit()).toBe(0)
  activeSessions.delete(initialSession)

  const resumedSession = spawnCliSession({
    cwd,
    entrypoint: lab4Entrypoint,
    args: ['--resume', sessionId],
    env: {
      NO_COLOR: '1',
      LAB4_MODEL_BACKEND: 'mock',
      LAB4_STORAGE_ROOT: storageRoot,
      LAB4_MEMORY_MIN_MESSAGES: '2',
      LAB4_MEMORY_MIN_MESSAGES_BETWEEN_UPDATES: '1',
      LAB4_MEMORY_PRESERVE_RECENT_MESSAGES: '2',
      LAB4_MOCK_RESPONSES: JSON.stringify([
        '{"type":"final","text":"resumed turn complete"}',
      ]),
    },
  })
  activeSessions.add(resumedSession)

  await resumedSession.waitForOutput(() =>
    resumedSession.stdout.includes(`Claude Codex · ${sessionId}`),
  )
  resumedSession.write('second request\n')
  await resumedSession.waitForOutput(() =>
    resumedSession.stdout.includes('assistant> resumed turn complete'),
  )
  resumedSession.write('/exit\n')
  expect(await resumedSession.waitForExit()).toBe(0)
  activeSessions.delete(resumedSession)

  const transcriptText = await readFile(
    join(storageRoot, 'sessions', `${encodeURIComponent(sessionId)}.json`),
    'utf8',
  )
  expect(transcriptText).toContain('first request')
  expect(transcriptText).toContain('first turn complete')
  expect(transcriptText).toContain('second request')
  expect(transcriptText).toContain('resumed turn complete')
})

test('lab4 continue loads the most recently updated session', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lab4-continue-'))
  tempDirs.push(cwd)

  await mkdir(join(cwd, 'src'), { recursive: true })
  await writeFile(join(cwd, 'README.md'), 'hello world\n', 'utf8')

  const storageRoot = join(cwd, '.lab4-state')
  await mkdir(join(storageRoot, 'sessions'), { recursive: true })

  await writeFile(
    join(storageRoot, 'sessions', 'older.json'),
    JSON.stringify(
      {
        id: 'older',
        transcript: [{ id: 'm1', role: 'user', text: 'older turn' }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
      },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(
    join(storageRoot, 'sessions', 'newer.json'),
    JSON.stringify(
      {
        id: 'newer',
        transcript: [{ id: 'm2', role: 'user', text: 'newer turn' }],
        createdAt: '2026-01-01T00:00:02.000Z',
        updatedAt: '2026-01-01T00:00:03.000Z',
      },
      null,
      2,
    ),
    'utf8',
  )

  const session = spawnCliSession({
    cwd,
    entrypoint: lab4Entrypoint,
    args: ['continue'],
    env: {
      NO_COLOR: '1',
      LAB4_MODEL_BACKEND: 'mock',
      LAB4_STORAGE_ROOT: storageRoot,
      LAB4_MOCK_RESPONSES: JSON.stringify([
        '{"type":"final","text":"continued newest session"}',
      ]),
    },
  })
  activeSessions.add(session)

  await session.waitForOutput(() =>
    session.stdout.includes('Claude Codex · newer'),
  )
  session.write('follow up\n')
  await session.waitForOutput(() =>
    session.stdout.includes('assistant> continued newest session'),
  )
  session.write('/exit\n')
  expect(await session.waitForExit()).toBe(0)
  activeSessions.delete(session)

  const newerTranscript = await readFile(
    join(storageRoot, 'sessions', 'newer.json'),
    'utf8',
  )
  const olderTranscript = await readFile(
    join(storageRoot, 'sessions', 'older.json'),
    'utf8',
  )

  expect(newerTranscript).toContain('newer turn')
  expect(newerTranscript).toContain('follow up')
  expect(newerTranscript).toContain('continued newest session')
  expect(olderTranscript).toContain('older turn')
  expect(olderTranscript).not.toContain('follow up')
})

test('lab4 list-sessions prints saved sessions in updated order', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lab4-list-sessions-'))
  tempDirs.push(cwd)

  const storageRoot = join(cwd, '.lab4-state')
  await mkdir(join(storageRoot, 'sessions'), { recursive: true })

  await writeFile(
    join(storageRoot, 'sessions', 'older.json'),
    JSON.stringify(
      {
        id: 'older',
        transcript: [
          { id: 'm1', role: 'user', text: 'inspect older session state' },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:01.000Z',
      },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(
    join(storageRoot, 'sessions', 'newer.json'),
    JSON.stringify(
      {
        id: 'newer',
        transcript: [
          { id: 'm2', role: 'user', text: 'inspect newer session state' },
        ],
        createdAt: '2026-01-01T00:00:02.000Z',
        updatedAt: '2026-01-01T00:00:03.000Z',
      },
      null,
      2,
    ),
    'utf8',
  )

  const session = spawnCliSession({
    cwd,
    entrypoint: lab4Entrypoint,
    args: ['--list-sessions'],
    env: {
      NO_COLOR: '1',
      LAB4_STORAGE_ROOT: storageRoot,
    },
  })
  activeSessions.add(session)

  const exitCode = await session.waitForExit()
  activeSessions.delete(session)

  expect(exitCode).toBe(0)
  expect(session.stdout).toContain('Saved lab4 sessions:')
  expect(session.stdout).toContain('- newer')
  expect(session.stdout).toContain('- older')
  expect(session.stdout).toContain('summary: inspect newer session state')
  expect(session.stdout).toContain('summary: inspect older session state')
  expect(session.stdout.indexOf('- newer')).toBeLessThan(
    session.stdout.indexOf('- older'),
  )
  expect(session.stdout).not.toContain('you> ')
})
