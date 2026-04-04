# lab2

`lab2` extends `lab1` into a minimal read-only repository agent.

## What it does

- multi-turn chat
- local in-memory transcript
- `QueryEngine` / `query()` split
- backend powered by official Codex CLI via `codex exec`
- default model `gpt-5.4-mini`
- default reasoning effort `low`
- two built-in tools:
  - `read_file(path)`
  - `search_code(query)`
- tool-using loop with a small max-step guard
- REPL with `exit` / `quit`

## Run

From the repo root:

```bash
bun install
make login
make lab2
```

## Debug mode

```bash
make lab2-debug
```

Debug mode prints Codex CLI's normal verbose stderr/stdout stream.

## Env vars

- `CODEX_MODEL`
- `CODEX_REASONING_EFFORT`
- `CODEX_SYSTEM_PROMPT`
- `LAB2_MAX_STEPS`
- `LAB2_MODEL_BACKEND`
- `LAB2_MOCK_RESPONSES`
- `DEBUG=1`

## Source layout

- `../../base/types/message.ts`: shared transcript message shape
- `../../base/types/agent.ts`: shared REPL event stream
- `../../base/types/model.ts`: shared model client interface
- `../../base/transcript/InMemoryTranscript.ts`: shared transcript storage
- `../../base/model/CodexCliModelClient.ts`: shared Codex CLI adapter
- `tools.ts`: tool protocol and built-in repo tools
- `query.ts`: bounded tool-using agent loop
- `../../core/engine/QueryEngine.ts`: shared session-level engine
- `repl/runRepl.ts`: terminal UI
