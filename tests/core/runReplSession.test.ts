import { expect, test } from 'bun:test'
import { PassThrough } from 'node:stream'
import { runReplSession } from '../../src/core/repl/runReplSession.ts'

test('runReplSession exits cleanly when input closes after one turn', async () => {
  const input = new PassThrough()
  const output = new PassThrough()
  let rendered = ''

  output.setEncoding('utf8')
  output.on('data', chunk => {
    rendered += chunk
  })

  input.end('hello\n')

  await runReplSession({
    input: input as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
    banner: {
      model: 'test-model',
      reasoningEffort: 'low',
      cwd: '/tmp/test',
      title: 'Test CLI',
      mode: 'test mode',
    },
    session: {
      async *submitUserText(text: string) {
        yield { type: 'assistant_message', payload: { text: `echo:${text}` } }
      },
    },
    renderEvent(event, output) {
      if (event.type === 'assistant_message') {
        output.write(`assistant> ${event.payload.text}\n`)
      }
    },
  })

  expect(rendered).toContain('Type exit to quit.')
  expect(rendered).toContain('assistant> echo:hello')
})
