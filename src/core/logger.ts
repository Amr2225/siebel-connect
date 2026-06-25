// Pluggable diagnostic logger for siebel-connect.
//
// The original bridge logged unconditionally through `console.log/warn/error` with `[NB]` prefixes.
// Plan req #7 replaces that with a sink that is (a) pluggable via `configure({ logger })` and
// (b) gated by `debug`. This is a deliberate, plan-sanctioned change to the *diagnostic* channel
// only (additive infrastructure, not core logic, so no Oracle citation needed). The error channel is
// separate: failures still throw `ConnectError`s regardless of `debug`. See ./errors.

import type { Logger } from './types'

// Re-export so consumers can `import { type Logger } from 'siebel-connect'` alongside `configure`.
export type { Logger }

/** Default sink: routes to the matching `console` method. */
const consoleLogger: Logger = {
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
}

let activeLogger: Logger = consoleLogger
let debugEnabled = false

/** Options accepted by {@link configure}. */
export interface ConfigureLoggerOptions {
  /** Replace the diagnostic sink. Omit to keep the current one. */
  logger?: Logger
  /** Master switch: when `false` (the default) the helpers emit nothing at all. */
  debug?: boolean
}

/**
 * Configure the diagnostic logger at runtime. Partial: only the fields you pass change.
 *
 * ```ts
 * configure({ debug: import.meta.env.DEV })          // turn diagnostics on in dev
 * configure({ logger: mySink })                       // route output somewhere else
 * ```
 */
export function configure(options: ConfigureLoggerOptions): void {
  if (options.logger !== undefined) activeLogger = options.logger
  if (options.debug !== undefined) debugEnabled = options.debug
}

/** Whether diagnostic output is currently enabled. */
export function isDebugEnabled(): boolean {
  return debugEnabled
}

// Internal helpers the ported bridge methods call instead of `console.*`. Each is a no-op unless
// `debug` is on, then it routes through the active logger. Keeping them tiny means the cost of a
// disabled log call is a single boolean check.

/** Diagnostic message (was `console.log('[NB] ...')`). No-op unless `debug`. */
export function log(...args: unknown[]): void {
  if (debugEnabled) activeLogger.log(...args)
}

/** Diagnostic warning (was `console.warn('[NB] ...')`). No-op unless `debug`. */
export function warn(...args: unknown[]): void {
  if (debugEnabled) activeLogger.warn(...args)
}

/** Diagnostic error (was `console.error('[NB] ...')`). No-op unless `debug`. */
export function error(...args: unknown[]): void {
  if (debugEnabled) activeLogger.error(...args)
}
