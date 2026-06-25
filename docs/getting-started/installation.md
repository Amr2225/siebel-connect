# Installation

## Requirements

- A Siebel Open UI deployment (IP16+) with the Nexus PR artifacts installed.
- Node.js 18+ for building the consuming app.
- React 17+ to use the `siebel-connect/react` hooks (optional peer dependency).

## Install

```bash
npm install siebel-connect
```

React is an **optional** peer dependency — install it only if you use the React adapter:

```bash
npm install react react-dom
```

## Next

- Declare your applet record types — see Typing (added in a later phase).
- Initialise the factory with `init(...)` and read applets with `getApplet(...)` — see Getting started.
