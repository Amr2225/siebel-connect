<!-- second-brain:start — managed by the second-brain skill, safe to keep -->

# CLAUDE.md — Second Brain Framework

This project is governed by the **second-brain** framework. The user's Obsidian vault is the second brain and the source of truth for knowledge, decisions, and plans.

**Vault:** `C:\Users\amrga\Documents\Obsidian Vault`
**Plan / hub note:** `02 Areas/Siebel/Siebel Connect — Typed Rewrite Plan.md`
**Code repo:** `C:\Users\amrga\Documents\Work\siebel-connect`

## Rules

1. The vault is the source of truth for knowledge/decisions; this repo is the source of truth for code. Keep them in sync by **linking**, never copying.
2. Never duplicate a note's or file's content. Reference with `[[wikilinks]]`.
3. Maintain a **Claude Session Note** in `06 Claude Sessions/` for this work: dated `created`/`updated`, linked to `[[Siebel Connect — Typed Rewrite Plan]]` and this repo. Resume today's note instead of creating duplicates.
4. Keep the session note's `## Next steps` checklist current — a hook surfaces open `- [ ]` items each turn.
5. Author vault notes with Obsidian markdown conventions; use **Mermaid** for any flow/architecture diagram. Write lean.

To (re)load the full framework, invoke the `second-brain` skill.

<!-- second-brain:end -->

## Project-specific rules (siebel-connect)

6. **Port core logic verbatim.** This is a _typed rewrite_ of `@ideaportriga/nexus-bridge` + `@ideaportriga/nexus-factory`. Do not change runtime behaviour. Only types and structure change.
7. **Validate before changing logic.** If a logic change is genuinely required, first find and cite the official Oracle Open UI documentation (Configuring Siebel Open UI / Open UI Developer's Reference) justifying it. No citation → no change.
8. **React-only for now.** Core stays framework-agnostic; React hooks live under `./react`. Mind re-renders and the `useSyncExternalStore`-based caching primitive.
9. **Strong typing is the goal.** No `any` leaks at the public surface; the typed `AppletRegistry` drives inference.
10. **Live docs (docmd).** Update `docs/` as code is implemented; `docmd.config.json` drives the site.
11. **NEVER use em dashes (—)** anywhere (code, comments, docs, commits). Use commas, colons, or parentheses.
12. **NEVER delete any local git branch**, even after it is merged. Keep all local branches.
13. **NEVER add Co-Authored-By in the commits**, keep the commits clean minimal and expresses what changes.
