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


# Architecture Guide: Hexagonal MVP (Strict Edition)

## 1. Core Philosophy
This project follows a strict, domain-first Hexagonal Architecture. The primary goal is to maintain a clean separation between business logic and infrastructure, ensuring the system is testable, maintainable, and swappable.

## 2. Layer Responsibilities

### 🧩 1. Domain Layer (`src/domain`)
- **Entities**: Core business objects and their logic.
- **Value Objects**: Objects defined by their attributes.
- **Ports**: Interfaces that define the boundaries (e.g., `UserRepositoryPort`).
- **Rules**: Zero imports from other layers. Pure business logic.

### ⚙️ 2. Application Layer (`src/application`)
- **Use Cases**: Orchestrate domain entities and ports to perform specific tasks.
- **Rules**: No knowledge of infrastructure details (DBs, APIs, Frameworks).

### 🧱 3. Infrastructure Layer (`src/infrastructure`)
- **Adapters**: Concrete implementations of domain ports (e.g., `SupabaseRepositoryImpl`).
- **Services**: Shared internal or external tools.
- **Rules**: Only handles translation between external worlds and the domain. No business logic.

### 🎨 4. Actions Layer (`src/actions`)
- **Next.js Server Actions**: The entry point for the UI.
- **Responsibilities**: 
  - Instantiate dependencies (Adapters, Use Cases).
  - Execute use cases.
  - Return serializable data or errors.
- **Rules**: Thin wrappers. No business logic. No state management.

### 🎨 5. UI Layer (`src/ui`)
- **Components**: React/Next.js components.
- **Stores (Zustand)**: ONLY for shared, cross-component state (e.g., Auth, global UI state).
- **Rules**: Dumb components. Trigger actions, render state.

---

## 3. Communication Flow (Server Actions Pattern)

UI Components -> Server Actions -> Application (Use Cases) -> Domain (Entities + Ports) -> Infrastructure (Adapters)

---

## 4. Feature Development Workflow

1.  **Define Entities** in `domain/entities/`.
2.  **Define Ports** (interfaces) in `domain/ports/`.
3.  **Implement Use Case** in `application/usecases/`.
4.  **Implement Adapter** in `infrastructure/adapters/`.
5.  **Create Server Action** in `actions/`.
6.  **Create UI Component** in `ui/components/`.
7.  **Write Tests** (TDD) for Entities and Use Cases.

---

## 5. Summary Table

| Layer | Folder | Purpose | Knows About | Example |
| :--- | :--- | :--- | :--- | :--- |
| **Domain** | `src/domain` | Business rules & contracts | Nothing | `User.ts`, `UserRepositoryPort.ts` |
| **Application** | `src/application` | Orchestrates domain logic | Domain | `RegisterUserUseCase.ts` |
| **Infrastructure** | `src/infrastructure` | Implements ports using tech | Domain | `UserRepositoryImpl.ts` |
| **Actions** | `src/actions` | Bridges UI and Application | Application & Infrastructure | `registerUserAction.ts` |
| **UI** | `src/ui` | Framework-bound view layer | Actions | `RegisterUserComponent.tsx` |

---

## 6. Rules for AI Agents (and Humans)

✅ **ALWAYS:**
- Use Plop generators for scaffolding (`bunx plop`).
- Mock adapters when testing use cases.
- Call server actions from components using `useTransition()`.

❌ **NEVER:**
- Put business logic in UI, Actions, or Adapters.
- Reference `infrastructure` or `ui` from `domain` or `application`.
- Create a Zustand store for every feature—keep state local where possible.
