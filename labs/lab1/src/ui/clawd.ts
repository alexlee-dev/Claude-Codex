const ANSI_RESET = '\u001B[0m'
const ANSI_BODY = '\u001B[38;2;215;119;87m'
const ANSI_BACKGROUND = '\u001B[48;2;0;0;0m'
const ANSI_DIM = '\u001B[2m'

const CLAWD_WIDTH = 9
const INNER_PADDING = 1
const CLAW_GAP = 2
const DEFAULT_BANNER_WIDTH = 72
const MIN_BANNER_WIDTH = 56
const MAX_BANNER_WIDTH = 88

export interface Lab1BannerOptions {
  model: string
  reasoningEffort: string
  cwd: string
}

function useColor(): boolean {
  return process.stdout.isTTY === true && process.env.NO_COLOR === undefined
}

function colorize(text: string, ansi: string): string {
  if (!useColor()) {
    return text
  }

  return `${ansi}${text}${ANSI_RESET}`
}

function body(text: string): string {
  return colorize(text, ANSI_BODY)
}

function bodyWithBackground(text: string): string {
  if (!useColor()) {
    return text
  }

  return `${ANSI_BODY}${ANSI_BACKGROUND}${text}${ANSI_RESET}`
}

function dim(text: string): string {
  return colorize(text, ANSI_DIM)
}

function border(text: string): string {
  return colorize(text, ANSI_BODY)
}

function stripAnsi(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '')
}

function visibleWidth(text: string): number {
  return stripAnsi(text).length
}

function padRight(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visibleWidth(text)))
}

function truncate(text: string, width: number): string {
  if (width <= 0) {
    return ''
  }

  if (text.length <= width) {
    return text
  }

  if (width === 1) {
    return '…'
  }

  return `${text.slice(0, width - 1)}…`
}

function renderClawdLines(): string[] {
  return [
    `${body(' ▐')}${bodyWithBackground('▛███▜')}${body('▌')}`,
    `${body('▝▜')}${bodyWithBackground('█████')}${body('▛▘')}`,
    `${body('  ▘▘ ▝▝  ')}`,
  ]
}

function buildTopBorder(width: number, title: string): string {
  const plainTitle = `  ${title} `
  const remaining = Math.max(0, width - plainTitle.length - 2)
  return `${border('╭')}${border('─')}${border(' ')}${border(title)}${border(' ')}${border('─'.repeat(remaining))}${border('╮')}`
}

function buildBottomBorder(width: number): string {
  return `${border('╰')}${border('─'.repeat(width - 2))}${border('╯')}`
}

function buildRow(width: number, content = ''): string {
  const innerWidth = width - 2
  return `${border('│')}${padRight(content, innerWidth)}${border('│')}`
}

export function renderLab1Banner(options: Lab1BannerOptions): string {
  const width = Math.max(
    MIN_BANNER_WIDTH,
    Math.min(process.stdout.columns ?? DEFAULT_BANNER_WIDTH, MAX_BANNER_WIDTH),
  )
  const innerWidth = width - 2
  const rightWidth =
    innerWidth - INNER_PADDING * 2 - CLAWD_WIDTH - CLAW_GAP

  const clawdLines = renderClawdLines()
  const infoLines = [
    'Claude Codex',
    `${dim('model')} ${truncate(options.model, rightWidth - 6)}`,
    `${dim('reasoning')} ${truncate(options.reasoningEffort, rightWidth - 10)}`,
    `${dim('cwd')} ${truncate(options.cwd, rightWidth - 4)}`,
    `${dim('mode')} multi-turn chat · no tools`,
  ]

  const rows = [
    buildTopBorder(width, 'Claude Codex'),
    buildRow(width),
    ...infoLines.map((line, index) => {
      const left = clawdLines[index] ?? ' '.repeat(CLAWD_WIDTH)
      const content =
        ' '.repeat(INNER_PADDING) +
        padRight(left, CLAWD_WIDTH) +
        ' '.repeat(CLAW_GAP) +
        truncate(line, rightWidth)
      return buildRow(width, content)
    }),
    buildRow(width),
    buildBottomBorder(width),
  ]

  return rows.join('\n')
}
