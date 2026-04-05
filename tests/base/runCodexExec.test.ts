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
printf '%s\\n' '{"type":"thread.started","thread_id":"thread_123"}'
printf '%s\\n' '{"type":"turn.started"}'
printf '%s' '{"type":"item.com'
sleep 0.01
printf '%s\\n' 'pleted","item":{"id":"item_0","type":"agent_message","text":"hello from json"}}'
printf '%s\\n' 'warn from stderr' >&2
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
    line: '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"hello from json"}}',
  })
  expect(debugEvents).toContainEqual({
    source: 'stderr',
    line: 'warn from stderr',
  })
})

test('runCodexExec rejects with stderr when the Codex command fails', async () => {
  const codexBin = await createFakeCodexBin(`
printf '%s\\n' 'fatal codex error' >&2
exit 1
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
  const script = `#!/bin/sh
${scriptBody}
`

  await writeFile(scriptPath, script, 'utf8')
  await chmod(scriptPath, 0o755)

  return scriptPath
}
