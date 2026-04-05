import { join } from 'node:path'
import type {
  LabStartupCommandRegistration,
  StartupCommand,
} from '../../../core/cli/StartupCommandRegistry.ts'
import { failStartupCommand } from '../../../core/cli/StartupCommandRegistry.ts'
import {
  FileSessionStore,
  type StoredSessionSummary,
} from '../../../core/session/FileSessionStore.ts'

export type Lab4StartupSelection =
  | { mode: 'new' }
  | { mode: 'resume'; sessionId: string }
  | { mode: 'continue' }

export const lab4StartupCommandRegistration: LabStartupCommandRegistration = {
  lab: 4,
  commands: [
    createNewCommand(),
    createResumeCommand(),
    createListSessionsCommand(),
    createContinueCommand(),
  ],
}

function createNewCommand(): StartupCommand<Lab4StartupSelection> {
  return {
    name: '--new',
    aliases: ['new'],
    description: 'Start a new lab4 session.',
    async run({ argv }) {
      if (argv.length > 1) {
        failStartupCommand('--new does not take additional arguments.')
      }

      return {
        type: 'continue',
        value: { mode: 'new' },
      }
    },
  }
}

function createResumeCommand(): StartupCommand<Lab4StartupSelection> {
  return {
    name: '--resume',
    aliases: ['resume'],
    description: 'Resume an existing lab4 session by id.',
    async run({ argv }) {
      const [, sessionId, extraArg] = argv

      if (!sessionId) {
        failStartupCommand('--resume requires a session id.')
      }

      if (extraArg !== undefined) {
        failStartupCommand('--resume takes exactly one session id.')
      }

      return {
        type: 'continue',
        value: { mode: 'resume', sessionId },
      }
    },
  }
}

function createListSessionsCommand(): StartupCommand {
  return {
    name: '--list-sessions',
    aliases: ['list-sessions'],
    description: 'List saved lab4 sessions and exit.',
    async run({ argv, cwd, env, output }) {
      if (argv.length > 1) {
        failStartupCommand('--list-sessions does not take additional arguments.')
      }

      const storageRoot = env.LAB4_STORAGE_ROOT ?? join(cwd, '.claude-codex')
      const sessionStore = new FileSessionStore(join(storageRoot, 'sessions'))
      const sessions = await sessionStore.listSummaries()

      if (sessions.length === 0) {
        output.write('No saved lab4 sessions found.\n')
        return { type: 'exit', code: 0 }
      }

      output.write('Saved lab4 sessions:\n')
      for (const session of sessions) {
        output.write(formatSessionSummary(session))
        output.write('\n')
      }

      return { type: 'exit', code: 0 }
    },
  }
}

function createContinueCommand(): StartupCommand<Lab4StartupSelection> {
  return {
    name: '--continue',
    aliases: ['continue'],
    description: 'Continue the most recently updated lab4 session.',
    async run({ argv }) {
      if (argv.length > 1) {
        failStartupCommand('--continue does not take additional arguments.')
      }

      return {
        type: 'continue',
        value: { mode: 'continue' },
      }
    },
  }
}

function formatSessionSummary(session: StoredSessionSummary): string {
  const createdAt = session.createdAt ?? '-'
  return [
    `- ${session.id}`,
    `  updated: ${session.updatedAt}`,
    `  created: ${createdAt}`,
    `  messages: ${session.messageCount}`,
    `  summary: ${session.summary}`,
  ].join('\n')
}
