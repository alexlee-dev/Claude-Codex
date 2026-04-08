# lab4

`lab4` extends `lab3` with durable sessions, persistent transcript storage, and a first-pass session-memory layer.

## What it does

- multi-turn chat
- file-backed session transcript
- persistent session-memory summary stored separately from the transcript
- the same bounded edit + verify tool loop as `lab3`
- artifact-backed tool results for large `search_code`, `run_command`, and `replace_in_file` outputs
- memory-aware model context: earlier work can be summarized into session memory while recent raw messages stay verbatim
- REPL with `/exit`, `/tools`, and session startup flags: `--new`, `--resume <id>`, `--continue`, `--list-sessions`

## Why it exists

`lab3` can already inspect and edit a repository, but it still behaves like an in-memory lab shell.

`lab4` introduces the first durable session architecture:

- save the raw transcript to disk
- maintain a separate reusable session memory summary
- preserve recent raw messages while older state moves into memory

This is the first step toward a more Claude Code-like runtime without reintroducing the old transcript compaction implementation.

## Run

From the repo root:

```bash
bun install
make login
make lab4
```

Startup modes:

```bash
bun run lab4
bun run lab4 --new
bun run lab4 --continue
bun run lab4 --resume <session-id>
bun run lab4 --list-sessions
```

## Debug mode

```bash
make lab4-debug
```

## Env vars

- `CODEX_MODEL`
- `CODEX_REASONING_EFFORT`
- `CODEX_SYSTEM_PROMPT`
- `LAB4_MAX_STEPS`
- `LAB4_MODEL_BACKEND`
- `LAB4_MOCK_RESPONSES`
- `LAB4_SESSION_ID`
- `LAB4_STORAGE_ROOT`
- `LAB4_MEMORY_MIN_MESSAGES`
- `LAB4_MEMORY_MIN_MESSAGES_BETWEEN_UPDATES`
- `LAB4_MEMORY_PRESERVE_RECENT_MESSAGES`
- `LAB3_SEARCH_CODE_MAX_INLINE_CHARS`
- `LAB3_RUN_COMMAND_MAX_INLINE_CHARS`
- `LAB3_REPLACE_IN_FILE_MAX_INLINE_CHARS`
- `DEBUG=1`

## Storage layout

By default, lab4 stores state under:

```text
.claude-codex/
  tool-results/<scope-id>/<message-id>.txt
  sessions/<session-id>.json
  session-memory/<session-id>.json
```

Session ids are generated as `timestamp-randomsuffix`, for example:

```text
20260405T131530123Z-8f3a1c2d4e5f
```
