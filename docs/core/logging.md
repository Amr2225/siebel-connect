# Logging

The original bridge logged unconditionally through `console.log` / `console.warn` / `console.error`
with `[NB]` prefixes. `siebel-connect` replaces that diagnostic channel with a sink that is both
pluggable and gated by a `debug` switch. Errors are a separate channel: failures still throw
[`ConnectError`](errors/) regardless of `debug`.

## `configure`

```ts
import { configure } from 'siebel-connect'

configure({ debug: import.meta.env.DEV })   // diagnostics on in dev, silent in prod
configure({ logger: mySink })               // route output somewhere other than console
```

`configure` is partial: it updates only the fields you pass.

| Option | Default | Effect |
| ------ | ------- | ------ |
| `debug` | `false` | Master switch. When `false`, the logger emits nothing at all. |
| `logger` | console sink | The `Logger` the package routes diagnostics through. |

## The `Logger` contract

A logger is any object with three methods:

```ts
interface Logger {
  log(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}
```

The default routes each to the matching `console` method. Provide your own to forward diagnostics to
a test spy, an in-app console, or a telemetry pipeline:

```ts
import { configure, type Logger } from 'siebel-connect'

const collected: string[] = []
const memoryLogger: Logger = {
  log: (...a) => collected.push(a.join(' ')),
  warn: (...a) => collected.push(a.join(' ')),
  error: (...a) => collected.push(a.join(' ')),
}

configure({ logger: memoryLogger, debug: true })
```

## Behaviour note

This is a deliberate change from the original (which always logged). It affects the diagnostic channel
only, never control flow, so it needs no Oracle citation. With `debug: false` (the default) the
package produces zero console output, which is the intended production posture. Use
`isDebugEnabled()` to read the current state.
