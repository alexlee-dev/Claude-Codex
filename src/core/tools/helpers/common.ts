import { isAbsolute, relative, resolve } from 'node:path'

export function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`)
  }

  return value
}

export function expectBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean`)
  }

  return value
}

export function expectStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new Error(`${fieldName} must be an array of strings`)
  }

  return value
}

export function resolvePathWithinCwd(path: string, cwd: string): string {
  const resolvedPath = resolve(cwd, path)
  const rel = relative(cwd, resolvedPath)

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path must stay inside cwd: ${path}`)
  }

  return resolvedPath
}

export function isExecNotFound(
  error: unknown,
): error is Error & { code: number | string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}

export function isEnoent(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
