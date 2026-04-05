import {
  failStartupCommand,
  type LabStartupCommandRegistration,
} from '../../../core/cli/StartupCommandRegistry.ts'

export const lab1StartupCommandRegistration: LabStartupCommandRegistration = {
  lab: 1,
  commands: [
    {
      name: '--foo',
      description: 'Print a lab1 startup marker and exit.',
      async run({ argv, output }) {
        if (argv.length > 1) {
          failStartupCommand('--foo does not take additional arguments.')
        }

        output.write('lab1 foo\n')
        return { type: 'exit', code: 0 }
      },
    },
  ],
}
