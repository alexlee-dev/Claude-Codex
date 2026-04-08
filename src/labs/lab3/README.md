# lab3

`lab3` extends `lab2` into a minimal self-editing repository agent.

## What it does

- multi-turn chat
- local in-memory transcript
- `QueryEngine` / `query()` split
- backend powered by official Codex CLI via `codex exec`
- default model `gpt-5.4-mini`
- default reasoning effort `low`
- four built-in tools:
  - `read_file(path)`
  - `search_code(query)`
  - `replace_in_file(path, old_string, new_string, replace_all?)`
  - `run_command(command, args)` with a small allowlist:
    - `bun test`
    - `cat <path>`
- tool-using loop with a small max-step guard
- artifact-backed tool results for large `search_code`, `run_command`, and `replace_in_file` outputs
- REPL with `/exit` and `/tools`

## Run

From the repo root:

```bash
bun install
make login
make lab3
```

## Debug mode

```bash
make lab3-debug
```

Debug mode prints Codex CLI's normal verbose stderr/stdout stream.

## Env vars

- `CODEX_MODEL`
- `CODEX_REASONING_EFFORT`
- `CODEX_SYSTEM_PROMPT`
- `LAB3_MAX_STEPS`
- `LAB3_MODEL_BACKEND`
- `LAB3_MOCK_RESPONSES`
- `LAB3_SEARCH_CODE_MAX_INLINE_CHARS`
- `LAB3_RUN_COMMAND_MAX_INLINE_CHARS`
- `LAB3_REPLACE_IN_FILE_MAX_INLINE_CHARS`
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
