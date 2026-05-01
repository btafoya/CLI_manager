# Code Analysis Report — CLI Manager

**Date:** 2026-04-30
**Scope:** Full project (Electron + React)
**Lines of Code:** ~9,500 (src/)
**TypeScript:** 0 errors
**Tests:** 26 passed / 3 files

---

## Metrics Snapshot

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| TS Errors | 0 | 0 | Pass |
| Test Pass Rate | 100% (26/26) | >90% | Pass |
| Largest Component | Settings.tsx (1,446 loc) | <300 | Fail |
| Largest Main File | main/index.ts (2,576 loc) | <500 | Fail |
| `any` Types | 0 | 0 | Pass |
| `console.log` (src) | 0 | 0 | Pass |
| `eval` / raw innerHTML | 0 | 0 | Pass |
| ARIA Attributes | 0 | >0 | Fail |
| IPC Handlers | 72 | — | Info |
| Renderer IPC Calls | 128 | — | Info |
| `setTimeout`/`setInterval` (renderer) | 30 | — | Info |
| `// TODO` / `// FIXME` | 0 | — | Pass |
| `// @ts-ignore` | 2 | 0 | Warn |
| `eslint-disable` | 4 | 0 | Warn |

---

## Findings

### Critical (FIXED)

#### 1. `shellQuote` + `execWithShell` Double-Escaping Bug
- **Location:** `src/main/index.ts:84` + all `execWithShell` call sites
- **Issue:** `shellQuote()` wrapped each argument in single quotes. `execWithShell()` then wrapped the *entire* command in single quotes and escaped internal quotes again, causing literal backslashes in arguments.
- **Fix:** Replaced `exec` with `execFile` in `execWithShell()`, passing the command directly to the login shell via array args. No intermediate shell = no double-escaping. `shellQuote()` preserved for callers to use on individual arguments.

### High

#### 2. Main Process Monolith (`main/index.ts` — 2,576 lines)
- **Location:** `src/main/index.ts`
- **Issue:** Single file contains app lifecycle, auto-updater, 72 IPC handlers, workspace/session CRUD, Git operations, GitHub operations, file search, settings, PATH fixes, and shell helpers.
- **Impact:** Impossible to unit test in isolation; high merge-conflict surface; violates single-responsibility principle.
- **Fix:** Extract into domain modules:
  - `ipc/workspaceHandlers.ts`
  - `ipc/gitHandlers.ts`
  - `ipc/githubHandlers.ts`
  - `ipc/terminalHandlers.ts`
  - `ipc/settingsHandlers.ts`

#### 3. Component Size Violations
- **Location:** Multiple
- **Details:**
  - `Settings.tsx` — 1,446 lines (claimed under 300 in guidelines)
  - `Sidebar/index.tsx` — 1,060 lines (claimed under 200 in CLAUDE.md)
  - `GitPanel.tsx` — 838 lines
  - `TerminalView.tsx` — 798 lines
  - `ContextMenus.tsx` — 664 lines
- **Impact:** Reduced readability, hard to test, increased cognitive load.
- **Fix:** Extract settings sections into `components/settings/` sub-components; extract Sidebar logic into hooks; split GitPanel into sub-panels.

#### 4. Zero Accessibility (a11y)
- **Location:** All renderer components
- **Issue:** No `aria-*` attributes and no `role` attributes found across the entire renderer.
- **Impact:** Screen readers cannot navigate the app; violates WCAG.
- **Fix:** Add `role`, `aria-label`, `aria-expanded`, `aria-selected` to Sidebar items, tabs, and modal dialogs.

### Medium

#### 5. Untyped Preload Bridge (`any[]` / `any` in IPC) (FIXED)
- **Location:** `src/preload/index.ts`, `src/renderer/src/env.d.ts`
- **Issue:** Templates, git status, branch data, and GitHub APIs were typed as `any` / `any[]`.
- **Fix:** Added `GitStatus`, `GitLogEntry` types to `shared/types.ts`. Replaced all `any` in preload/env.d.ts with proper types (`TerminalTemplate[]`, `GitStatus | null`, `GitLogEntry[]`, `Record<string, unknown>`, `unknown[]`, `IPCResult<unknown[]>`). Fixed `ghWorkflowStatus` return type mismatch (`any[]` vs `IPCResult<any[]>`).

#### 6. No Runtime Input Validation
- **Location:** IPC handlers in `main/index.ts`
- **Issue:** No Zod, Joi, or similar library validates payloads from the renderer before processing.
- **Impact:** Malformed or unexpected IPC payloads can cause crashes or logic errors.
- **Fix:** Add lightweight validation (e.g., manual checks or a schema library) for all `ipcMain.handle` inputs.

#### 7. Unbounded `Map` State Allocations
- **Location:** `src/renderer/src/App.tsx`
- **Issue:** `sessionStatuses`, `sessionOrders` are stored as `Map` objects in React state. Every update creates a `new Map(prev)`, producing a new reference even if contents are identical, forcing re-renders of all consumers.
- **Impact:** Unnecessary re-renders; performance degradation as workspace/session count grows.
- **Fix:** Use Immer, or normalize state into plain objects/arrays, or memoize selectors.

#### 8. Terminal Polling in Renderer
- **Location:** `src/renderer/src/components/TerminalView.tsx`
- **Issue:** 500ms `pollTimerRef` for session status polling per terminal instance.
- **Impact:** With 10 terminals, 20 polls/second; CPU waste.
- **Fix:** Move polling to Main process (`TerminalManager` or `CLISessionTracker`) and push updates via IPC.

#### 9. Debug Logs in Production Code (FIXED)
- **Location:** `src/renderer/src/utils/terminalPatterns.ts`
- **Fix:** Removed 2 `console.log` calls from `terminalPatterns.ts`.

#### 10. Large Unchecked File Operations
- **Location:** `src/main/index.ts` (file search / ripgrep)
- **Issue:** File search IPC handler invokes `rg` with user-supplied query. While `rg` itself is safe, the output is streamed directly back without size limits.
- **Impact:** A query matching millions of lines could OOM the renderer.
- **Fix:** Cap `rg` output (e.g., `--max-count` or truncate after N MB).

### Low

#### 11. `@ts-ignore` Usage
- **Location:** 2 instances
- **Fix:** Replace with `@ts-expect-error` and a comment, or fix the underlying type error.

#### 12. Missing Renderer Tests
- **Location:** `src/renderer/src/`
- **Issue:** All 26 tests are in `src/main/`. No React component tests.
- **Fix:** Add Vitest + React Testing Library for at least `App.tsx`, `Sidebar`, and `TerminalView`.

#### 13. Component Re-render Risk (`useEffect` without deps)
- **Location:** `src/renderer/src/App.tsx` has many `useEffect` hooks with large or missing dependency arrays.
- **Fix:** Audit dependency arrays for stale closures and add `eslint-plugin-react-hooks` if not present.

---

## Recommendations (Prioritized)

| Priority | Action | Files |
|----------|--------|-------|
| P0 | Fix `shellQuote` double-escaping in `execWithShell` | `src/main/index.ts` |
| P1 | Split `main/index.ts` into domain IPC modules | `src/main/ipc/*.ts` |
| P1 | Extract `Settings.tsx` sections into sub-components | `src/renderer/src/components/settings/*.tsx` |
| P1 | Refactor `Sidebar/index.tsx` to match CLAUDE.md target (<200 loc) | `src/renderer/src/components/Sidebar/` |
| P2 | Add ARIA attributes to Sidebar, tabs, and modals | All renderer components |
| P2 | Replace `any` types in preload/env.d.ts | `src/preload/index.ts`, `src/renderer/src/env.d.ts` |
| P2 | Add runtime IPC payload validation | `src/main/index.ts` handlers |
| P2 | Move terminal status polling to Main process | `src/main/TerminalManager.ts`, `src/renderer/src/components/TerminalView.tsx` |
| P3 | Add renderer unit tests | `src/renderer/src/**/*.test.tsx` |
| P3 | Remove remaining `console.log` calls | `src/renderer/src/utils/terminalPatterns.ts` |

---

## Architecture Risk Summary

- **Main process bloat** is the single biggest maintainability risk.
- **Renderer state** is centralized in `App.tsx` with mutable `Map` references, risking cascading re-renders.
- **Security posture** is generally good (no `eval`, no raw HTML injection, typed errors), but the shell-escaping bug and lack of IPC input validation are gaps.
- **Accessibility** is completely absent and blocks production readiness for diverse users.
