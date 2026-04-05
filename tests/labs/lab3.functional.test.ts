import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CliSession } from '../base/spawnCliSession.ts'
import { spawnCliSession } from '../base/spawnCliSession.ts'

const lab3Entrypoint = fileURLToPath(
  new URL('../../src/labs/lab3/repl/runRepl.ts', import.meta.url),
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

test('lab3 CLI can edit a file and run approved verification commands with mock model output', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lab3-functional-'))
  tempDirs.push(cwd)

  await mkdir(join(cwd, 'src'), { recursive: true })
  await writeFile(join(cwd, 'README.md'), 'hello world\n', 'utf8')
  await writeFile(
    join(cwd, 'package.json'),
    JSON.stringify(
      {
        name: 'lab3-fixture',
        version: '1.2.3',
        private: true,
        type: 'module',
      },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(
    join(cwd, 'sample.test.ts'),
    [
      "import { expect, test } from 'bun:test'",
      '',
      "test('sample passes', () => {",
      '  expect(2 + 2).toBe(4)',
      '})',
      '',
    ].join('\n'),
    'utf8',
  )

  const session = spawnCliSession({
    cwd,
    entrypoint: lab3Entrypoint,
    env: {
      NO_COLOR: '1',
      LAB3_MODEL_BACKEND: 'mock',
      LAB3_MOCK_RESPONSES: JSON.stringify([
        '{"type":"tool_call","tool":"read_file","input":{"path":"README.md"}}',
        '{"type":"tool_call","tool":"replace_in_file","input":{"path":"README.md","old_string":"hello world","new_string":"hello Claude","replace_all":false}}',
        '{"type":"tool_call","tool":"run_command","input":{"command":"cat","args":["README.md"]}}',
        '{"type":"tool_call","tool":"run_command","input":{"command":"bun","args":["test"]}}',
        '{"type":"final","text":"Updated README.md to say hello Claude and verified the repo with cat and bun test."}',
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
    session.stdout.includes(
      '- search_code: Search repository text with ripgrep and return matching lines.',
    ),
  )
  await session.waitForOutput(() =>
    session.stdout.includes(
      '- replace_in_file: Replace exact UTF-8 text inside a repository file.',
    ),
  )
  await session.waitForOutput(() =>
    session.stdout.includes(
      '- run_command: Run a small allowlist of safe repository commands: bun test or cat <path>.',
    ),
  )
  session.write('update the README greeting and verify it.\n')

  await session.waitForOutput(() =>
    session.stdout.includes('tool:read_file> {"path":"README.md"}'),
  )
  await session.waitForOutput(() =>
    session.stdout.includes('tool:replace_in_file> {"path":"README.md","old_string":"hello world","new_string":"hello Claude","replace_all":false}'),
  )
  await session.waitForOutput(() =>
    session.stdout.includes('approval required for replace_in_file'),
  )
  session.write('1\n')
  await session.waitForOutput(() =>
    session.stdout.includes('tool:run_command> {"command":"cat","args":["README.md"]}'),
  )
  await session.waitForOutput(() =>
    session.stdout.includes('approval required for run_command'),
  )
  session.write('1\n')
  await session.waitForOutput(() =>
    session.stdout.includes('COMMAND: cat README.md'),
  )
  await session.waitForOutput(() =>
    session.stdout.includes('hello Claude'),
  )
  await session.waitForOutput(
    () =>
      session.stdout.includes(
        'tool:run_command> {"command":"bun","args":["test"]}',
      ),
    10_000,
  )
  await session.waitForOutput(
    () => session.stdout.includes('input: {"command":"bun","args":["test"]}'),
    10_000,
  )
  session.write('1\n')
  await session.waitForOutput(
    () => session.stdout.includes('COMMAND: bun test'),
    10_000,
  )
  await session.waitForOutput(
    () => session.stdout.includes('EXIT CODE: 0'),
    10_000,
  )
  await session.waitForOutput(
    () =>
      session.stdout.includes(
        'assistant> Updated README.md to say hello Claude and verified the repo with cat and bun test.',
      ),
    10_000,
  )

  session.write('/exit\n')
  const exitCode = await session.waitForExit()

  activeSessions.delete(session)

  expect(exitCode).toBe(0)
  expect(session.stderr).toBe('')
  expect(session.stdout).toContain('Type /exit to quit. Type /tools to list tools.')
  expect(session.stdout).toContain('Available tools:')
  expect(session.stdout).toContain('approval required for replace_in_file')
  expect(session.stdout).toContain('approval required for run_command')
  expect(session.stdout).toContain('tool:replace_in_file>')
  expect(session.stdout).toContain('COMMAND: bun test')
  expect(await readFile(join(cwd, 'README.md'), 'utf8')).toBe('hello Claude\n')
})

test('lab3 CLI refuses unapproved non-read tool calls', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lab3-functional-deny-'))
  tempDirs.push(cwd)

  await writeFile(join(cwd, 'README.md'), 'hello world\n', 'utf8')

  const session = spawnCliSession({
    cwd,
    entrypoint: lab3Entrypoint,
    env: {
      NO_COLOR: '1',
      LAB3_MODEL_BACKEND: 'mock',
      LAB3_MOCK_RESPONSES: JSON.stringify([
        '{"type":"tool_call","tool":"replace_in_file","input":{"path":"README.md","old_string":"hello world","new_string":"hello Claude","replace_all":false}}',
        '{"type":"final","text":"Edit skipped because approval was denied."}',
      ]),
    },
  })
  activeSessions.add(session)

  await session.waitForOutput(() => session.stdout.includes('you> '))
  session.write('update the README greeting.\n')

  await session.waitForOutput(() =>
    session.stdout.includes('approval required for replace_in_file'),
  )
  session.write('2\n')

  await session.waitForOutput(() =>
    session.stdout.includes(
      'tool:error:replace_in_file> ERROR: tool call denied by user',
    ),
  )
  await session.waitForOutput(() =>
    session.stdout.includes(
      'assistant> Edit skipped because approval was denied.',
    ),
  )

  session.write('/exit\n')
  const exitCode = await session.waitForExit()

  activeSessions.delete(session)

  expect(exitCode).toBe(0)
  expect(session.stderr).toBe('')
  expect(session.stdout).toContain('approval required for replace_in_file')
  expect(session.stdout).toContain(
    'tool:error:replace_in_file> ERROR: tool call denied by user',
  )
  expect(await readFile(join(cwd, 'README.md'), 'utf8')).toBe('hello world\n')
})

test('lab3 rejects unknown startup commands before entering the REPL', async () => {
  const session = spawnCliSession({
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    entrypoint: lab3Entrypoint,
    args: ['--fooo'],
    env: {
      NO_COLOR: '1',
    },
  })
  activeSessions.add(session)

  const exitCode = await session.waitForExit()
  activeSessions.delete(session)

  expect(exitCode).not.toBe(0)
  expect(session.stdout).not.toContain('you> ')
  expect(session.stderr).toContain(
    'error: Unknown startup command: --fooo',
  )
  expect(session.stderr).not.toContain('at runStartupCommand')
})
