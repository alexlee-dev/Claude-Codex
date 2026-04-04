.PHONY: lab1 lab1-debug lab1-test lab2 lab2-debug login test typecheck

lab1:
	bun run dev

lab1-debug:
	DEBUG=1 bun run dev

lab1-test:
	bun test tests/labs/lab1.functional.test.ts

lab2:
	bun run lab2

lab2-debug:
	DEBUG=1 bun run lab2

login:
	bun run codex:login

test:
	bun run test

typecheck:
	bun run typecheck
