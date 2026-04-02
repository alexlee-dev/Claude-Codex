.PHONY: lab1 lab1-debug login typecheck

lab1:
	bun run dev

lab1-debug:
	DEBUG=1 bun run dev

login:
	bun run codex:login

typecheck:
	bun run typecheck
