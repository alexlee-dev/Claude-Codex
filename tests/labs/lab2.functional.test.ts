import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CliSession } from '../base/spawnCliSession.ts'
import { spawnCliSession } from '../base/spawnCliSession.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const lab2Entrypoint = fileURLToPath(
  new URL('../../src/labs/lab2/repl/runRepl.ts', import.meta.url),
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

test('lab2 CLI can search for alexlee and read the first matching file with mock model output', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lab2-functional-'))
  tempDirs.push(cwd)

  await mkdir(join(cwd, 'docs'), { recursive: true })
  await writeFile(
    join(cwd, 'docs', 'alexlee-note.txt'),
    ['alexlee lives here', 'second line of content'].join('\n'),
    'utf8',
  )
  await writeFile(join(cwd, 'README.md'), 'no matching keyword here\n', 'utf8')

  const session = spawnCliSession({
    cwd,
    entrypoint: lab2Entrypoint,
    env: {
      NO_COLOR: '1',
      LAB2_MODEL_BACKEND: 'mock',
      LAB2_MOCK_RESPONSES: JSON.stringify([
        '{"type":"tool_call","tool":"search_code","input":{"query":"alexlee"}}',
        '{"type":"tool_call","tool":"read_file","input":{"path":"docs/alexlee-note.txt"}}',
        '{"type":"final","text":"The first matching file is docs/alexlee-note.txt. Its content starts with: alexlee lives here"}',
      ]),
    },
  })
  activeSessions.add(session)

  await session.waitForOutput(() => session.stdout.includes('you> '))
  session.write('/tools\n')

  await session.waitForOutput(() =>
    session.stdout.includes('Available tools:\n- read_file:'),
  )
  await session.waitForOutput(() =>
    session.stdout.includes('- search_code: Search repository text with ripgrep and return matching lines.'),
  )
  session.write('search the repo with key word "alexlee" and tell me the content of the first file.\n')

  await session.waitForOutput(() =>
    session.stdout.includes('tool:search_code> {"query":"alexlee"}'),
  )
  await session.waitForOutput(() =>
    session.stdout.includes(
      'tool:result:search_code> ./docs/alexlee-note.txt:1:alexlee lives here',
    ),
  )
  await session.waitForOutput(() =>
    session.stdout.includes('tool:read_file> {"path":"docs/alexlee-note.txt"}'),
  )
  await session.waitForOutput(() =>
    session.stdout.includes('tool:result:read_file> FILE: docs/alexlee-note.txt'),
  )
  await session.waitForOutput(() =>
    session.stdout.includes('assistant> The first matching file is docs/alexlee-note.txt.'),
  )

  session.write('/exit\n')
  const exitCode = await session.waitForExit()

  activeSessions.delete(session)

  expect(exitCode).toBe(0)
  expect(session.stderr).toBe('')
  expect(session.stdout).toContain('Type /exit to quit. Type /tools to list tools.')
  expect(session.stdout).toContain('Available tools:')
  expect(session.stdout).toContain('tool:search_code> {"query":"alexlee"}')
  expect(session.stdout).toContain(
    'tool:result:search_code> ./docs/alexlee-note.txt:1:alexlee lives here',
  )
  expect(session.stdout).toContain(
    'tool:read_file> {"path":"docs/alexlee-note.txt"}',
  )
  expect(session.stdout).toContain('FILE: docs/alexlee-note.txt')
  expect(session.stdout).toContain('alexlee lives here')
  expect(session.stdout).toContain(
    'assistant> The first matching file is docs/alexlee-note.txt.',
  )
})
