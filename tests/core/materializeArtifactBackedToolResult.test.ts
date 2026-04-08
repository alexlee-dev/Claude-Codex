import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { materializeArtifactBackedToolResult } from '../../src/core/artifacts/materializeArtifactBackedToolResult.ts'

test('materializeArtifactBackedToolResult leaves small output inline', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'codex-artifact-inline-'))

  try {
    const result = await materializeArtifactBackedToolResult({
      toolName: 'search_code',
      output: 'small output',
      cwd,
      scopeId: 'demo',
      messageId: 'msg-1',
      thresholdChars: 100,
    })

    expect(result).toEqual({
      messageText: 'small output',
    })
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('materializeArtifactBackedToolResult persists large output under cwd', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'codex-artifact-store-'))
  const output = Array.from({ length: 60 }, (_, index) => `line ${index}`)
    .join('\n')

  try {
    const result = await materializeArtifactBackedToolResult({
      toolName: 'search_code',
      output,
      cwd,
      scopeId: 'demo-scope',
      messageId: 'msg-1',
      thresholdChars: 100,
    })

    expect(result.artifact?.relativePath).toBe(
      '.claude-codex/tool-results/demo-scope/msg-1.txt',
    )
    expect(result.messageText).toContain('[full tool result stored separately]')
    expect(result.messageText).toContain(
      'path: .claude-codex/tool-results/demo-scope/msg-1.txt',
    )

    const persisted = await readFile(
      join(cwd, '.claude-codex', 'tool-results', 'demo-scope', 'msg-1.txt'),
      'utf8',
    )
    expect(persisted).toBe(output)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('materializeArtifactBackedToolResult falls back inline when persistence fails', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'codex-artifact-fallback-'))
  const output = 'x'.repeat(300)

  try {
    await writeFile(join(cwd, '.claude-codex'), 'blocking file', 'utf8')

    const result = await materializeArtifactBackedToolResult({
      toolName: 'run_command',
      output,
      cwd,
      scopeId: 'demo',
      messageId: 'msg-2',
      thresholdChars: 100,
    })

    expect(result).toEqual({
      messageText: output,
    })
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})
