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

- `src/types/message.ts`: minimal transcript message shape
- `src/types/transcript.ts`: transcript interface
- `src/types/model.ts`: model client interface
- `src/transcript/InMemoryTranscript.ts`: transcript storage
- `src/model/CodexCliModelClient.ts`: Codex CLI adapter
- `src/query.ts`: single-turn query runner
- `src/QueryEngine.ts`: session-level engine
- `src/repl/runRepl.ts`: terminal UI
