<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent Guidelines for DeepBound

## Code Principles

### 1. Radical Simplicity
- Every line of code must earn its keep
- Delete unused code immediately
- Prefer fewer, smaller files over consolidated "utilities"
- If it's not essential to the MVP, cut it

### 2. Modularity & Maintainability
- Each file does ONE thing
- Name files descriptively: `ChatWithPersonaUseCase.ts` not `chat.ts`
- Extract repeated patterns into shared utilities
- Coupling: minimize; Cohesion: maximize

---

## Development Process (and subagent usage)

Spawn a subagent for every distinct step in this flow

### 1) Research
Research all relevant files in the codebase pertinent to what you need to build; read all documentation using web search that you need to know to implement the feature you're working on; etc.

### 2) Plan

Think through step by step how you're going to implement the feature.
Write out your full plan for implementation to the user in the chat. Include:
1. Summary
2. What you WILL do
3. What you WILL NOT do
4. Step by step approach, change-by-change
5. Success criteria

Create a todo list of each change you'll make

### 3) Implement
Write tests according to your plan's success criteria; make sure you run them first so they fail; then implement changes, run tests again, and iterate until tests pass.
Run through your todo list systematically.

### NOTE: TDD Required Throughout
**Write tests BEFORE code.** Process:
1. Write a failing test for the desired behavior
2. Write the minimal code to pass
3. Refactor for clarity

Test location: `__tests__/` folders alongside source files.

---

## SOLID Principles

Apply ALL five principles in EVERY code written:

### Single Responsibility Principle (SRP)
- One reason to change per class/function
- `ChatWithPersonaUseCase` only handles chat orchestration

### Open/Closed Principle (OCP)
- Open for extension, closed for modification
- Add new adapters without touching existing code

### Liskov Substitution Principle (LSP)
- Subtypes must be substitutable for base types
- Any `LlmServicePort` implementation works interchangeably

### Interface Segregation Principle (ISP)
- Small, focused interfaces over large ones
- Separate `ChatServicePort` from `CriticServicePort`

### Dependency Inversion Principle (DIP)
- Depend on abstractions, not concretions
- Use case → port (interface) → adapter (implementation)

---

## Code Style

- **No comments** unless explaining complex business logic, or for docstrings
- **Document all methods**; keep concise and simple to read
- **TypeScript strict mode** - no `@ts-ignore` or `@ts-nocheck`
- **Lint passing** - run `npm run lint` before commit
- **Tests passing** - run `npm run test` before commit

---

## What NOT To Build

Resist feature creep. Before adding anything:
1. Is it essential for the MVP?
2. Can we simplify the approach?
3. Does it add maintenance burden?

If yes to any, question it. Simplicity > completeness.
