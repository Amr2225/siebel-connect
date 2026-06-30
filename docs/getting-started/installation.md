---
title: "Installation"
description: "Install siebel-connect and its optional React peer dependency."
---

# Installation

## Requirements

- A Siebel Open UI deployment (IP16+) with the Siebel Connect PR artifacts installed (see
  [Siebel setup](./siebel-setup/)).
- Node.js 18+ to build the consuming app.
- React 17+ to use the `siebel-connect/react` hooks (optional peer dependency).

## Install

```bash
npm install siebel-connect
```

React is an **optional** peer dependency. Install it only if you use the React adapter:

```bash
npm install react react-dom
```

## What you get

The package exposes four entry points (see [Overview](/)):

| Import                          | Use it for                                       |
| ------------------------------- | ------------------------------------------------ |
| `siebel-connect`                | The factory and applet classes (no React).       |
| `siebel-connect/react`          | The React hooks.                                 |
| `siebel-connect/testing`        | The in-memory mock Siebel for tests.             |
| `siebel-connect/siebel-globals` | Ambient `window.SiebelApp` / `SiebelJS` types.   |

## Next

1. Register your applets in the Physical Renderer and mount your React app: [Siebel setup](./siebel-setup/).
2. Declare your applet record types: [Typing your applets](./typing/).
3. Initialise the factory: [Initialising the factory](./init/).
