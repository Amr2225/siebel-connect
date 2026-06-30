# Testing & CI

How the test suite is structured, how to run it, and the conventions a change is expected to follow. For
the in-memory Siebel harness itself (driving a mock PM, notification batches), see [Testing
harness](../testing.md).

## Running the suite

```bash
pnpm typecheck      # tsc --noEmit: the whole program, including .test-d.ts
pnpm lint           # eslint
pnpm test           # vitest run: unit + type-level tests
pnpm test:coverage  # vitest run --coverage: same, plus the coverage gate
pnpm test:watch     # vitest watch mode while developing
pnpm build          # tsup (ESM + CJS + dts)
pnpm docs:build     # docmd static build
```

CI (`.github/workflows/ci.yaml`) runs exactly these on every push to `main` and every pull request:
typecheck, lint, `test:coverage`, build, docs build. A red gate on any one fails the PR.

## Test layout

Tests live in `test/` and run under jsdom with globals enabled.

- `test/*.test.ts` / `*.test.tsx` are **runtime** tests. They exercise behaviour against the mock Siebel
  harness (`siebel-connect/testing`), asserting the legacy bridge's observable contract, not the
  implementation.
- `test/**/*.test-d.ts` are **type-level** tests, run by Vitest's `typecheck` mode (`tsc` under the hood).
  They assert inference and the no-`any` guarantee; they contain no runtime assertions.
- `test/fixtures/` holds shared `MockAppletDef` seeds.

Vitest resolves the package's own name to `src/` (see the `resolve.alias` in `vitest.config.ts`), so tests
import through the public specifiers (`siebel-connect`, `siebel-connect/react`, `siebel-connect/testing`)
and exercise the real barrels rather than a stale `dist/`.

## Conventions

- **Assert behaviour, not the mock.** A test should encode what the legacy bridge guarantees (return
  shapes, thrown error types, accept/skip rules), so it stays green only while parity holds.
- **Self-clean.** Always `siebel?.destroy()` in `afterEach`, and `clear(...)` / `PopupController.resetInstanceForTesting()`
  when a test touches the factory memo or the popup singleton. Tests must be independent and order-free.
- **Drive the side-effecting paths.** The hooks and applet verbs that invoke Siebel methods
  (`writeRecord`, query mode, MVG retrieval, positioning) are the highest-value coverage: test both the
  success path and the failure mode (readonly control, missing control, positioning-did-not-happen).

## expect-type conventions

Type-level tests use Vitest's `expectTypeOf`. Two patterns carry most of the weight:

```ts
// 1. Registry inference: a registered key resolves to its record type, end to end.
expectTypeOf(getApplet('accountList')).toEqualTypeOf<Applet<Account>>()
expectTypeOf(getApplet('accountList').getCurrentRecord()).toEqualTypeOf<Account | undefined>()

// 2. No `any` leaks at the public door.
expectTypeOf(getApplet('accountList')).not.toBeAny()
```

- **Augment via the public package name**, exactly as a consumer would:

  ```ts
  declare module 'siebel-connect' {
    interface AppletRegistry {
      accountList: Account
    }
  }
  ```

- **Assert membership, not the exact union, for `AppletKey`.** Several test files augment the registry, so
  `AppletKey` is the union of every registered key across the program. Use `toMatchTypeOf<AppletKey>()`,
  not `toEqualTypeOf`, or the test breaks the moment another file adds a key.
- Keep a `not.toBeAny()` sweep over new public exports (`test/public-surface.test-d.ts`): it is the
  regression guard that fails loudly if a return type is ever widened to `any`.

## Package-manifest checks

CI also runs `pnpm lint:package` ([publint](https://publint.dev)) after the build, validating the
published `exports` map against the freshly-built `dist/` (the per-condition `types`/`import`/`require`
entries, the `.d.cts` declarations for CJS consumers, no stray files). Run it locally before changing
anything under `exports`, `main`, `module`, or `types` in `package.json`.

For a deeper type-resolution report across module systems, run [`@arethetypeswrong/cli`](https://arethetypeswrong.github.io)
on demand:

```bash
pnpm dlx @arethetypeswrong/cli --pack .
```

Two flags it reports are expected, not defects: `node10` cannot resolve subpath `exports` (we are an
ESM-first package using `exports`), and `./siebel-globals` is a types-only ambient module (no runtime, so
a CJS consumer "dynamic-imports" it).

## Coverage gate

`pnpm test:coverage` enforces the thresholds in `vitest.config.ts` (`coverage.thresholds`). Coverage is
scoped to `src/**`; pure-type modules, `.d.ts` ambient declarations, and re-export barrels are excluded
(there is nothing executable to assert on). The floors sit a few points under the current numbers: enough
headroom that an unrelated refactor will not trip them, low enough that dropping a tested module's coverage
fails the build. If you add a module, add tests for it rather than lowering a floor.
