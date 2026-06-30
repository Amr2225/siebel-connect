# Changelog

All notable changes to `siebel-connect` are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-30

First publishable release: a fully-typed, React-first rewrite of `@ideaportriga/nexus-bridge` +
`@ideaportriga/nexus-factory`, with the original runtime behaviour preserved.

### Added

- **Core applet classes** ported call-for-call from Nexus Bridge, now generic over the record type:
  `BaseApplet<TRecord>`, `Applet<TRecord>`, `PopupApplet<TRecord>`, plus the `PopupController`,
  `Notifications`, and `LocaleData` singletons.
- **Typed factory** (`init` / `getApplet` / `getPopup` / `clear` / `configure`) driven by an
  augmentable `AppletRegistry`, replacing the untyped `NexusFactory`. Unknown keys throw
  `AppletNotFoundError` instead of returning `null`.
- **React adapter** (`siebel-connect/react`): `useRecordSet`, `useCurrentRecord`, `useApplet`,
  `useQueryMode`, and `useAsyncAction`, built on a `useSyncExternalStore` applet store with
  selector-based, minimal re-renders.
- **Typed error hierarchy** (`ConnectError` and subclasses) replacing string throws, with the original
  message text preserved.
- **Pluggable logger** via `configure({ logger, debug })`, replacing unconditional `console.log`.
- **In-memory mock Siebel harness** (`siebel-connect/testing`) for tests and offline development.
- **Ambient Siebel globals** (`siebel-connect/siebel-globals`).
- **Documentation site** (docmd) covering getting started, task-oriented guides, and the full API
  reference, with a Nexus migration guide.

### Notes

- This is a typed rewrite, not a redesign: runtime method names and behaviour are unchanged. See the
  [migration guide](./docs/migration.md) for the `NexusFactory` to `siebel-connect` map.

[0.1.0]: https://semver.org/
