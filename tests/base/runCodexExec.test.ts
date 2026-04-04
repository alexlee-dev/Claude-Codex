import { afterEach, expect, test } from 'bun:test'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCodexExec } from '../../src/base/model/runCodexExec.ts'
import type { CodexDebugEvent } from '../../src/base/model/codexDebug.ts'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
  )
})

test('runCodexExec reads the final assistant message from JSON stdout', async () => {
  const codexBin = await createFakeCodexBin(`
process.stdout.write('Reading additional input from stdin...\\n')
process.stdout.write('{"type":"thread.started","thread_id":"thread_123"}\\n')
process.stdout.write('{"type":"turn.started"}\\n')
process.stdout.write('{"type":"item.com')
setTimeout(() => {
  process.stdout.write('pleted","item":{"id":"item_0","type":"agent_message","text":"hello from json"}}\\n')
  process.stderr.write('warn from stderr\\n')
  process.exit(0)
}, 10)
  `)
  const debugEvents: CodexDebugEvent[] = []

  const text = await runCodexExec({
    prompt: 'ignored by fake codex',
    codexBin,
    onDebugEvent: event => {
      debugEvents.push(event)
    },
  })

  expect(text).toBe('hello from json')
  expect(debugEvents).toContainEqual({
    source: 'stdout',
    line: 'Reading additional input from stdin...',
  })
  expect(debugEvents).toContainEqual({
    source: 'stdout',
    line: '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"hello from json"}}',
  })
  expect(debugEvents).toContainEqual({
    source: 'stderr',
    line: 'warn from stderr',
  })
})

test('runCodexExec rejects with stderr when the Codex command fails', async () => {
  const codexBin = await createFakeCodexBin(`
process.stderr.write('fatal codex error\\n')
process.exit(1)
  `)

  await expect(
    runCodexExec({
      prompt: 'ignored by fake codex',
      codexBin,
    }),
  ).rejects.toThrow('fatal codex error')
})

async function createFakeCodexBin(scriptBody: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fake-codex-bin-'))
  tempDirs.push(dir)

  const scriptPath = join(dir, 'fake-codex')
  const script = `#!/usr/bin/env node
${scriptBody}
`

  await writeFile(scriptPath, script, 'utf8')
  await chmod(scriptPath, 0o755)

  return scriptPath
}
