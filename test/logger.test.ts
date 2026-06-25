import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Logger } from 'siebel-connect'

// The logger holds module-level state (active sink + debug flag). Re-import it fresh per test via
// `vi.resetModules()` so each case starts from the defaults (console sink, debug off).
async function freshLogger() {
  vi.resetModules()
  return import('../src/core/logger')
}

function makeSpyLogger(): Logger & { calls: { log: number; warn: number; error: number } } {
  const calls = { log: 0, warn: 0, error: 0 }
  return {
    calls,
    log: () => {
      calls.log++
    },
    warn: () => {
      calls.warn++
    },
    error: () => {
      calls.error++
    },
  }
}

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits nothing when debug is false (the default)', async () => {
    const { configure, log, warn, error, isDebugEnabled } = await freshLogger()
    const sink = makeSpyLogger()
    configure({ logger: sink })

    expect(isDebugEnabled()).toBe(false)
    log('quiet')
    warn('quiet')
    error('quiet')
    expect(sink.calls).toEqual({ log: 0, warn: 0, error: 0 })
  })

  it('emits through the active sink only when debug is true', async () => {
    const { configure, log, warn, error } = await freshLogger()
    const sink = makeSpyLogger()
    configure({ logger: sink, debug: true })

    log('a')
    warn('b')
    error('c')
    expect(sink.calls).toEqual({ log: 1, warn: 1, error: 1 })
  })

  it('routes to console by default when no custom logger is set', async () => {
    const { configure, log } = await freshLogger()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    configure({ debug: true })

    log('[NB] hello')
    expect(consoleSpy).toHaveBeenCalledWith('[NB] hello')
  })

  it('configure is partial: changing debug keeps the existing logger', async () => {
    const { configure, log } = await freshLogger()
    const sink = makeSpyLogger()
    configure({ logger: sink })
    configure({ debug: true }) // no logger passed, so the sink must persist

    log('still-routed')
    expect(sink.calls.log).toBe(1)
  })

  it('can be toggled back off at runtime', async () => {
    const { configure, log } = await freshLogger()
    const sink = makeSpyLogger()
    configure({ logger: sink, debug: true })
    log('on')
    configure({ debug: false })
    log('off')
    expect(sink.calls.log).toBe(1)
  })
})
