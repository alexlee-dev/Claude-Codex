import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import type { Tool } from '../../../core/tools/ToolRegistry.ts'
import {
  expectString,
  resolvePathWithinCwd,
} from '../../../core/tools/helpers/common.ts'

export function createReadFileTool(): Tool {
  return {
    name: 'read_file',
    description: 'Read a UTF-8 text file inside the current repository.',
    inputHint: '{"path":"relative/path/to/file.ts"}',
    async run(input, ctx) {
      const path = expectString(input.path, 'path')
      const resolvedPath = resolvePathWithinCwd(path, ctx.cwd)
      const text = await readFile(resolvedPath, 'utf8')

      return [`FILE: ${relative(ctx.cwd, resolvedPath) || '.'}`, text].join(
        '\n\n',
      )
    },
  }
}
