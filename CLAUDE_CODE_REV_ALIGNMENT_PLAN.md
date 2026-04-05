# Claude-Codex Alignment Plan

This document maps the most valuable `code-agent-labs` experiments onto `~/open-projects/Claude-Codex`, with one goal:

make Claude-Codex converge toward the architecture shape visible in `claude-code-rev`, instead of staying a teaching-only lab agent.

The recommendation is intentionally prioritized. If everything is treated as equally important, the project will grow sideways instead of upward.

## Current Gap

Today Claude-Codex already has:

- a multi-turn transcript
- a bounded tool loop
- basic repo inspection tools
- basic self-editing tools
- a first-pass context manager that trims tool output and inserts a synthetic summary

What it does not yet have, compared with `claude-code-rev`, is the more production-shaped runtime around that loop:

- durable sessions and resume
- a memory layer distinct from the raw transcript
- artifact-backed handling for large tool results
- richer event streaming and observability
- a stronger permission layer
- a more extensible external-tool / MCP-like protocol

That difference matters because `claude-code-rev` is not mainly "better prompts". It is mostly a stronger runtime around the same core coding loop.

## Priority 1

These are the highest-value additions. They most directly reduce the architectural gap with `claude-code-rev`.

### Lab 13: Session Memory + Summarizer

#### What to implement

- Add a persistent session-memory store separate from the normal transcript.
- After important turns, generate a reusable memory summary instead of relying only on one-shot inline compaction text.
- On resume or long sessions, seed model context from memory plus the recent tail, instead of replaying the entire transcript.
- Treat memory as a distinct message/source type, not just another assistant message string.
- Add tests for:
  - memory generation
  - memory loading on resume
  - memory refresh after additional turns
  - precedence between memory summary and recent raw messages

#### Why this matters

This is the single most important step if the goal is to resemble `claude-code-rev`.

Claude-Codex `lab4` currently compresses history into a synthetic summary message for the next model call. That is useful, but still transcript-centric. `claude-code-rev` is already moving toward a stronger split between transcript history and compact reusable memory, which is what lets long sessions remain coherent without blindly stuffing old conversation back into context.

#### What "good" looks like

- a `SessionMemoryStore`
- a transcript summarizer focused on durable facts, not conversational recap
- a loading rule like: `memory summary + preserved recent raw tail + current user turn`
- explicit tests that verify memory survives across process boundaries

#### Why it should be first

If you improve only the summary prompt, you will get nicer compressed text but the same weak architecture. Session memory changes the architecture itself.

### Lab 11: Tool Artifacts + Context Compression

#### What to implement

- Add artifact-backed storage for oversized tool outputs.
- Replace giant inline tool messages with:
  - a short inline summary
  - a pointer or artifact reference
  - optional metadata such as tool name, file path, artifact path, and truncation reason
- Extend the context manager so compaction can keep the summary inline while the full tool output lives outside the active message window.
- Add re-hydration logic so the agent can deliberately re-read the artifact when needed.
- Add tests for:
  - large tool outputs becoming artifact-backed
  - artifact summary injection into the transcript
  - re-read behavior
  - compaction behavior when artifacts already exist

#### Why this matters

This is the next most important gap after session memory.

Right now Claude-Codex trims tool results by chopping the head and tail. That is fine for a lab, but weak for production. `claude-code-rev` clearly trends toward "do not keep all large payloads inline forever"; instead it preserves enough context to continue while keeping a path back to the full content. Artifact-backed tool output is the cleanest way to achieve that.

#### What "good" looks like

- `SearchCode` and `ReadFile` can emit compact summaries when outputs are large
- transcripts remain readable and bounded
- the model still has a recovery path to the complete output
- the compaction layer understands artifacts instead of flattening everything into plain text

#### Why it should be first-tier instead of second-tier

Because this is where message compression stops being a formatting trick and becomes real context engineering.

### Lab 8: Session Resume

#### What to implement

- Persist transcripts to disk with session IDs.
- Add a session index and restore flow.
- Make the query engine load an existing transcript before continuing a conversation.
- Support session continuation with:
  - prior transcript
  - recent compact summary
  - session memory, once Lab 13 exists
- Add tests for:
  - save/load round-trip
  - resume after a previous turn
  - resume after compaction
  - session listing and invalid-session handling

#### Why this matters

`claude-code-rev` is shaped like a durable CLI system, not a disposable in-memory toy loop.

Claude-Codex still centers an in-memory transcript. That keeps the code simple, but it blocks the entire class of workflows where the user exits, returns, resumes, and expects the agent to keep working from prior context. Without durable sessions, any attempt to imitate Claude Code remains shallow.

#### What "good" looks like

- a `SessionStore`
- stable message serialization
- a CLI or REPL entrypoint that can resume a previous conversation
- session-aware compaction and memory loading

## Priority 2

These are extremely worthwhile, but they build on the first tier instead of replacing it.

### Lab 6: Streaming + Observability

#### What to implement

- Introduce a streaming runner that emits structured turn events rather than only final assistant text.
- Model events should cover at least:
  - turn started
  - model requested tool
  - tool completed
  - tool denied
  - assistant final
  - turn completed
- Update the REPL/UI path to consume events incrementally.
- Add logs or debug traces around model steps and compaction decisions.
- Add tests for:
  - event ordering
  - tool call event emission
  - final event emission
  - error/denial event cases

#### Why this matters

`claude-code-rev` is event-heavy. A lot of its capabilities depend on the runtime being able to reason about a turn as a sequence of events, not as one opaque request/response.

Without streaming, observability stays weak. Without observability, compaction, permissions, retries, and future multi-agent or background-task behavior all become harder to reason about.

#### What "good" looks like

- a `StreamingQuery` or `StreamingAgentRunner`
- the ability to show partial state in the terminal
- structured debug hooks for later analytics or inspection

### Lab 3 Pattern: Permission Engine

#### What to implement

- Pull permissions out of individual tools and put them behind a dedicated permission engine.
- Support at least:
  - `allow`
  - `ask`
  - `denyDangerous`
- Add workspace-boundary checks, command allowlists, and mutation/read classification.
- Make permission checks explicit in the tool execution path rather than implicit in tool code.
- Add tests for:
  - read operations inside workspace
  - denied commands outside allowlist
  - ask/approve flow
  - mutation tools versus read-only tools

#### Why this matters

Claude-Codex already has some bounded editing, but not the stronger runtime-level permission model you need for a serious local coding agent.

`claude-code-rev` takes permission and execution policy very seriously. If you want to align with that shape, permissions must become a first-class subsystem, not just scattered checks inside tools.

#### What "good" looks like

- `PermissionEngine`
- a clear permission request object
- tool execution paths that can be audited and reasoned about centrally

### Lab 12: Deeper MCP-Style Tool Protocol

#### What to implement

- Move from a flat built-in tool list toward namespaced tool descriptors.
- Add structured tool metadata:
  - tool name
  - namespace/provider
  - description
  - input schema
  - success/failure shape
- Make the model-facing tool contract stable enough that external providers can plug in later.
- Add tests for:
  - tool discovery
  - namespaced invocation
  - structured success
  - structured failure

#### Why this matters

Claude-Codex today still feels like a local lab tool registry. `claude-code-rev` has clearly evolved far beyond that, especially around MCP and remote/external tool handling.

You do not need to fully clone the original protocol immediately, but you do need to stop designing as if tools will always be local one-off functions. This lab is what changes the direction of the API.

#### What "good" looks like

- provider-backed registries
- richer tool descriptors
- consistent namespaces such as `mcp/server/tool`

## Priority 3

These are valuable, but they should come after the first two tiers because they depend on the runtime already being more durable and structured.

### Lab 10: Codex Streaming Bridge

#### What to implement

- Add a bridge between the local agent runtime and a real Codex streaming model path.
- Keep the same runner/tool/context architecture while swapping in a real streaming backend.
- Normalize provider streaming events into Claude-Codex's internal event model.
- Add tests or smoke checks for:
  - tool call parsing
  - final response parsing
  - event normalization

#### Why this matters

This helps Claude-Codex stop being "just a teaching mock" and become a realistic model-runtime integration.

It is not the first thing to do because a real backend plugged into a weak runtime still gives you a weak product. Once the session, memory, artifact, and event layers exist, this bridge becomes much more valuable.

### Lab 9: Git Patch Review

#### What to implement

- Add helpers that inspect the current diff or patch set.
- Summarize changed files, diff stats, and likely review concerns.
- Make patch review available as a workflow tool rather than only a shell escape hatch.
- Add tests for:
  - diff parsing
  - changed file listing
  - review summary generation

#### Why this matters

This is useful because serious coding agents should not only edit files; they should also reason about the patch they created.

But this is workflow enhancement, not core runtime alignment. It should come after the durability, context, and protocol layers are in place.

### Lab 7: External Tools

#### What to implement

- Add an external tool provider interface.
- Allow Claude-Codex to load tools from providers beyond the built-in set.
- Keep provider loading separate from model/tool execution.
- Add tests for:
  - provider discovery
  - provider tool registration
  - successful external tool invocation

#### Why this matters

This is a useful stepping stone, but if Lab 12 is implemented well, Lab 7 can mostly be absorbed into the same design wave.

Treat it as the simpler precursor to deeper MCP-style tool protocol support, not as the final architecture.

### Lab 5: CLI Capstone

#### What to implement

- Consolidate the labs behind a more production-shaped CLI entrypoint.
- Support print mode, interactive mode, and session-aware startup.
- Add flags for model choice, reasoning effort, cwd, and resume behavior.

#### Why this matters

Claude-Codex already has a lab-oriented entrypoint story, so this is less urgent than the architectural gaps above.

It becomes important when the runtime beneath it is strong enough to deserve a cleaner public interface.

## Suggested Build Order

If the goal is "become more like `claude-code-rev` as fast as possible", the recommended implementation order is:

1. Session resume foundation
2. Session memory store and transcript summarizer
3. Artifact-backed tool result compression
4. Streaming event runner
5. Dedicated permission engine
6. Richer tool protocol / MCP-style descriptors
7. Real Codex streaming bridge
8. Git-aware patch review
9. CLI consolidation

The reason to start with session resume before full session memory is practical: durable storage gives you the place to attach memory and compact state. After that, memory and artifact-backed compression become much easier to design cleanly.

## Concrete Recommendation For Claude-Codex

If you want a realistic near-term roadmap, do not start by polishing `ContextManager` summaries.

Instead:

- build durable transcript storage
- add session memory as a separate layer
- convert oversized tool results into artifacts + inline summaries
- then upgrade the runner into a streaming, permission-aware runtime

That sequence will move Claude-Codex toward the shape of `claude-code-rev` much faster than adding more labs in numerical order.

## Short Version

- Priority 1 changes the architecture.
- Priority 2 strengthens the runtime.
- Priority 3 broadens workflows and integrations.

If only one thing can be done next, implement session durability plus session memory. That is the point where Claude-Codex stops being "a good lab project" and starts becoming "a plausible Claude Code-style agent runtime."
