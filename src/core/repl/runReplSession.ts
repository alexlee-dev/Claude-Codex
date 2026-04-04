import readline from 'node:readline/promises'
import { stdin as defaultInput, stdout as defaultOutput } from 'node:process'
import { renderBanner, type BannerOptions } from '../../base/ui/renderBanner.ts'

export interface ReplSessionLike<TEvent> {
  submitUserText(text: string): AsyncGenerator<TEvent, void>
}

export interface RunReplSessionOptions<TEvent> {
  session: ReplSessionLike<TEvent>
  banner: BannerOptions
  renderEvent: (event: TEvent, output: NodeJS.WriteStream) => void
  toolCatalog?: string
  setToolApprovalHandler?: (
    handler:
      | ((request: {
          toolName: string
          description: string
          input: Record<string, unknown>
        }) => Promise<boolean>)
      | undefined,
  ) => void
  input?: NodeJS.ReadStream
  output?: NodeJS.WriteStream
}

export async function runReplSession<TEvent>(
  options: RunReplSessionOptions<TEvent>,
): Promise<void> {
  const input = options.input ?? defaultInput
  const output = options.output ?? defaultOutput
  const rl = readline.createInterface({ input, output })
  options.setToolApprovalHandler?.(request =>
    promptForToolApproval(rl, output, request),
  )

  output.write(`${renderBanner(options.banner)}\n`)
  output.write('Type /exit to quit. Type /tools to list tools.\n')

  try {
    while (true) {
      let answer: string

      try {
        answer = await rl.question('you> ')
      } catch (error) {
        if (isReadlineClosedError(error)) {
          break
        }

        throw error
      }

      const text = answer.trim()
      if (!text) {
        continue
      }

      if (text === '/exit') {
        output.write('bye\n')
        break
      }

      if (text === '/tools') {
        if (options.toolCatalog) {
          output.write(`Available tools:\n${options.toolCatalog}\n`)
        } else {
          output.write('No tools available.\n')
        }
        continue
      }

      for await (const event of options.session.submitUserText(text)) {
        options.renderEvent(event, output)
      }
    }
  } finally {
    options.setToolApprovalHandler?.(undefined)
    rl.close()
  }
}

async function promptForToolApproval(
  rl: readline.Interface,
  output: NodeJS.WriteStream,
  request: {
    toolName: string
    description: string
    input: Record<string, unknown>
  },
): Promise<boolean> {
  output.write(
    [
      `approval required for ${request.toolName}`,
      request.description,
      `input: ${JSON.stringify(request.input)}`,
      '1. Approve',
      '2. Deny',
    ].join('\n') + '\n',
  )

  while (true) {
    const answer = (await rl.question('approval> ')).trim()

    if (answer === '1') {
      return true
    }

    if (answer === '2') {
      return false
    }

    output.write('Enter 1 or 2.\n')
  }
}

function isReadlineClosedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_USE_AFTER_CLOSE'
  )
}
