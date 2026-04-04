import type { Tool } from '../../../core/tools/ToolRegistry.ts'
import {
  expectString,
  isExecNotFound,
} from '../../../core/tools/helpers/common.ts'
import {
  isRipgrepNoMatch,
  runRipgrep,
} from '../../../core/tools/helpers/command.ts'

export function createSearchCodeTool(): Tool {
  return {
    name: 'search_code',
    description:
      'Search repository text with ripgrep and return matching lines.',
    inputHint: '{"query":"QueryEngine|tool|MCP"}',
    async run(input, ctx) {
      const query = expectString(input.query, 'query').trim()
      if (!query) {
        throw new Error('query must not be empty')
      }

      try {
        const stdout = await runRipgrep(query, ctx.cwd)
        const trimmed = stdout.trim()
        if (!trimmed) {
          return `No matches found for query: ${query}`
        }

        return trimmed
      } catch (error) {
        if (isExecNotFound(error)) {
          throw new Error('rg is not installed or not available in PATH')
        }

        if (isRipgrepNoMatch(error)) {
          return `No matches found for query: ${query}`
        }

        throw error
      }
    },
  }
}
