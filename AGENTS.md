# Agents

This repository uses AI agents to assist with development tasks. This file
provides entry points for agent discovery.

## Project Overview

Staticalize is a CLI tool and library that downloads and staticalizes websites
from a sitemap. It fetches pages, rewrites links to point to a new base URL, and
saves the result to disk. Published to JSR as `@frontside/staticalize` and to
npm via a Deno build step.

## Effection

This repository builds on
[Effection](https://github.com/thefrontside/effection), a structured concurrency
library. Before working with code here, read the
[Effection AGENTS.md](https://github.com/thefrontside/effection/blob/v4/AGENTS.md)
for essential concepts:

- Operations vs Promises (lazy vs eager execution)
- Scope ownership and structured concurrency
- Entry points (`main()`, `run()`, `createScope()`)
- Streams, channels, and the `each()` pattern

## Tech Stack

- **Runtime**: Deno
- **Build**: TypeScript, `deno task`
- **Testing**: Deno test runner (`deno test -A`)
- **Linting/Formatting**: Deno built-in (`deno lint`, `deno fmt`)
- **Dependencies**: Import map in `deno.json` (JSR + npm specifiers)

## Coding Standards

### TypeScript

- Strict mode enabled
- Prefer `type` imports for type-only imports
- Use explicit return types on public functions

### Effection Patterns

- Use structured concurrency (spawn, scope)
- Resources must clean up properly on scope exit
- Prefer `Operation<T>` for async operations
- Use `until()` for lifting promises into operations
- Never kill the process directly (`Deno.exit()`, `process.exit()`) — use
  `yield* exit()` from Effection

## Commit and PR Conventions

Use [gitmoji](https://gitmoji.dev) for commit and pull request subjects. For
changes to files that direct the behavior of AI such as AGENTS.md or llms.txt
use a robot emoji instead of the standard gitmoji for documentation.

Do not include any agent marketing material (e.g. "Generated with...",
"Co-Authored-By: \<agent>") in commits, pull requests, issues, or comments.

Pull requests use **Motivation / Approach** sections (not Summary / Test plan).
