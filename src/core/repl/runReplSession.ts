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
  input?: NodeJS.ReadStream
  output?: NodeJS.WriteStream
}

export async function runReplSession<TEvent>(
  options: RunReplSessionOptions<TEvent>,
): Promise<void> {
  const input = options.input ?? defaultInput
  const output = options.output ?? defaultOutput
  const rl = readline.createInterface({ input, output })

  output.write(`${renderBanner(options.banner)}\n`)
  output.write('Type exit to quit.\n')

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

      if (text === 'exit' || text === 'quit') {
        output.write('bye\n')
        break
      }

      for await (const event of options.session.submitUserText(text)) {
        options.renderEvent(event, output)
      }
    }
  } finally {
    rl.close()
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
