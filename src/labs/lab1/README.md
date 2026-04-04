# lab1

`lab1` is the smallest useful local agent loop in this repo.

## What it does

- multi-turn chat
- local in-memory transcript
- `QueryEngine` / `query()` split
- backend powered by official Codex CLI via `codex exec`
- default model `gpt-5.4-mini`
- default reasoning effort `low`
- no tools
- REPL with `exit` / `quit`

## Run

From the repo root:

```bash
bun install
make login
make lab1
```

## Debug mode

```bash
make lab1-debug
```

Debug mode prints Codex CLI's normal verbose stderr/stdout stream.

Typical things you will see:

- model/provider/sandbox summary
- rendered prompt sections
- warnings from Codex CLI
- final assistant text as emitted by Codex

## Env vars

- `CODEX_MODEL`
- `CODEX_REASONING_EFFORT`
- `CODEX_SYSTEM_PROMPT`
- `DEBUG=1`

## Source layout

- `../../base/types/message.ts`: shared transcript message shape
- `../../base/types/agent.ts`: shared REPL event stream
- `../../base/types/model.ts`: shared model client interface
- `../../base/transcript/InMemoryTranscript.ts`: shared transcript storage
- `../../base/model/CodexCliModelClient.ts`: shared Codex CLI adapter
- `query.ts`: single-turn query runner
- `../../core/engine/QueryEngine.ts`: shared session-level engine
- `repl/runRepl.ts`: terminal UI
