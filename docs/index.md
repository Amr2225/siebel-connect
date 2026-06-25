# siebel-connect

A fully-typed, **React-first** bridge to Siebel Open UI's Business Component (BC) layer.

`siebel-connect` is a typed rewrite of `@ideaportriga/nexus-bridge` + `@ideaportriga/nexus-factory`. It
keeps the original runtime behaviour and adds:

- **Strong types end-to-end** — an augmentable `AppletRegistry` drives inference, so
  `getApplet('accountList')` returns a typed `Applet<Account>`, not `any`.
- **React hooks** with minimal re-renders, backed by Siebel's own BC notifications.
- **A typed error hierarchy**, a pluggable logger, and an in-memory mock Siebel for tests.

## Entry points

| Import | Contents |
| ------ | -------- |
| `siebel-connect` | Core applet classes + typed factory (framework-agnostic) |
| `siebel-connect/react` | React adapter hooks |
| `siebel-connect/testing` | In-memory Siebel mock harness |
| `siebel-connect/siebel-globals` | Ambient `window.SiebelApp` / `SiebelJS` / `SiebelAppFacade` types |

## Status

Under active development. Docs grow per module as each phase lands — see the project plan for the
phased rollout.

Start with [Installation](./getting-started/installation/).
