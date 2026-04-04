import { expect, test } from 'bun:test'
import { ToolRegistry, type Tool } from '../../src/core/tools/ToolRegistry.ts'

function createTool(name: string, description: string): Tool {
  return {
    name,
    description,
    inputHint: '{}',
    async run() {
      return description
    },
  }
}

test('ToolRegistry merges lab tools cumulatively and lets newer labs override older tool names', () => {
  const registry = new ToolRegistry([
    {
      lab: 1,
      tools: [createTool('read_file', 'lab1 read')],
    },
    {
      lab: 2,
      tools: [createTool('search_code', 'lab2 search')],
    },
    {
      lab: 3,
      tools: [
        createTool('read_file', 'lab3 read override'),
        createTool('replace_in_file', 'lab3 edit'),
      ],
    },
  ])

  expect(registry.getToolsForLab(1).map(tool => tool.name)).toEqual([
    'read_file',
  ])

  const lab3Tools = registry.getToolsForLab(3)
  expect(lab3Tools.map(tool => tool.name)).toEqual([
    'read_file',
    'search_code',
    'replace_in_file',
  ])
  expect(lab3Tools[0]?.description).toBe('lab3 read override')
})
