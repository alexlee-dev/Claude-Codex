import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import type { Tool } from '../../../core/tools/ToolRegistry.ts'
import {
  countOccurrences,
  expectBoolean,
  expectString,
  isEnoent,
  MAX_TEXT_CHARS,
  resolvePathWithinCwd,
  truncateText,
} from './shared.ts'

export function createReplaceInFileTool(): Tool {
  return {
    name: 'replace_in_file',
    description:
      'Replace exact UTF-8 text inside a repository file. Can create a new file when old_string is empty.',
    inputHint:
      '{"path":"src/app.ts","old_string":"old text","new_string":"new text","replace_all":false}',
    requiresApproval: true,
    async run(input, ctx) {
      const path = expectString(input.path, 'path')
      const oldString = expectString(input.old_string, 'old_string')
      const newString = expectString(input.new_string, 'new_string')
      const replaceAll = expectBoolean(input.replace_all ?? false, 'replace_all')
      const resolvedPath = resolvePathWithinCwd(path, ctx.cwd)

      if (oldString === newString) {
        throw new Error('old_string and new_string must differ')
      }

      let originalText: string | null
      try {
        originalText = await readFile(resolvedPath, 'utf8')
      } catch (error) {
        if (!isEnoent(error)) {
          throw error
        }
        originalText = null
      }

      if (originalText === null) {
        if (oldString !== '') {
          throw new Error(
            'file does not exist. Use old_string as an empty string to create it.',
          )
        }

        await mkdir(dirname(resolvedPath), { recursive: true })
        await writeFile(resolvedPath, newString, 'utf8')

        return [
          `FILE: ${relative(ctx.cwd, resolvedPath) || '.'}`,
          'ACTION: created',
          truncateText(newString, MAX_TEXT_CHARS),
        ].join('\n\n')
      }

      if (oldString === '') {
        if (originalText.length > 0) {
          throw new Error(
            'old_string must not be empty when editing an existing non-empty file',
          )
        }

        await writeFile(resolvedPath, newString, 'utf8')

        return [
          `FILE: ${relative(ctx.cwd, resolvedPath) || '.'}`,
          'ACTION: updated',
          'REPLACED: 1 occurrence',
          truncateText(newString, MAX_TEXT_CHARS),
        ].join('\n\n')
      }

      const matchCount = countOccurrences(originalText, oldString)
      if (matchCount === 0) {
        throw new Error('old_string was not found in the file')
      }

      if (matchCount > 1 && !replaceAll) {
        throw new Error(
          `old_string matched ${matchCount} times. Provide more context or set replace_all to true.`,
        )
      }

      const updatedText = replaceAll
        ? originalText.split(oldString).join(newString)
        : originalText.replace(oldString, newString)

      await writeFile(resolvedPath, updatedText, 'utf8')

      return [
        `FILE: ${relative(ctx.cwd, resolvedPath) || '.'}`,
        'ACTION: updated',
        `REPLACED: ${replaceAll ? matchCount : 1} occurrence${replaceAll && matchCount !== 1 ? 's' : ''}`,
        truncateText(updatedText, MAX_TEXT_CHARS),
      ].join('\n\n')
    },
  }
}
