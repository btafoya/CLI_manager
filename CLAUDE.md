# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CLI Manager is an Electron-based terminal management application. It manages multiple workspaces and terminal sessions, **Git worktrees as separate workspaces**, **GitHub integration**, and local port monitoring.

## Tech Stack

- **Framework**: Electron + React
- **Build Tool**: electron-vite
- **UI**: TailwindCSS + framer-motion
- **Terminal**: xterm.js + node-pty
- **Storage**: electron-store
- **Git**: simple-git
- **GitHub**: gh CLI
- **Package Manager**: pnpm

## Development Commands

```bash
# Start dev server (HMR supported)
pnpm dev

# Production build
pnpm build

# Preview built app
pnpm preview
# or
pnpm start

# Type check
pnpm typecheck

# Run tests
pnpm test

# Test coverage
pnpm test:coverage
```

## Architecture

### Process Structure (Electron Multi-Process)

1. **Main Process** (`src/main/`)
   - `index.ts`: App initialization, IPC handlers, workspace/session management
   - `TerminalManager.ts`: Terminal process creation/management using node-pty
   - `PortManager.ts`: Localhost port monitoring via macOS `lsof` / Linux `ss`/`netstat` (every 5s)
   - `SystemMonitor.ts`: Cross-platform system info (CPU, RAM, disk, battery, uptime)

2. **Renderer Process** (`src/renderer/`)
   - `App.tsx`: Main application component, state management
   - `components/Sidebar/`: **Refactored modular sidebar components**
     - `index.tsx`: Main Sidebar component (under 200 lines)
     - `WorkspaceItem.tsx`: Workspace item component
     - `WorktreeItem.tsx`: Worktree workspace item component
     - `SessionItem.tsx`: Terminal session item component
     - `ContextMenus.tsx`: Context menu components
     - `Modals.tsx`: Modal components
   - `components/TerminalView.tsx`: xterm.js terminal instance
   - `components/StatusBar.tsx`: Port monitoring and system info display
   - `components/GitPanel.tsx`: Git status management panel
   - `components/Settings.tsx`: Settings screen
   - `hooks/`: **Custom hooks**
     - `useWorkspaceBranches.ts`: Per-workspace branch info management
     - `useTemplates.ts`: Custom terminal template management
     - `useKeyboardShortcuts.ts`: Global keyboard shortcut handling
   - `constants/`: **Constants & utilities**
     - `icons.tsx`: Template icon mapping
     - `styles.ts`: Common style constants

3. **Preload** (`src/preload/`)
   - `index.ts`: Main ↔ Renderer IPC bridge (contextBridge)
   - `index.d.ts`: TypeScript type definitions

4. **Shared** (`src/shared/`)
   - `types.ts`: Common TypeScript type definitions for Main/Renderer

### Code Organization & Best Practices

#### Component Separation Principles

1. **Single Responsibility**: Each component performs one clear role
   - `SessionItem`: Terminal session rendering and interaction
   - `WorkspaceItem`: Workspace and child element management
   - `WorktreeItem`: Worktree-specific rendering logic

2. **Logic Extraction**: Extract business logic into custom hooks
   - `useWorkspaceBranches`: Branch info loading and state management
   - `useTemplates`: Template loading and settings change detection
   - `useKeyboardShortcuts`: Shortcut binding and action dispatch

3. **Reusability**: Common logic goes into utilities
   - `getTemplateIcon`: Icon name → React component mapping
   - `NOTIFICATION_COLORS`: Notification status color constants

#### Refactoring Results

- **Sidebar.tsx**: 820 lines → under 200 lines (75% reduction)
- **Component count**: 1 → 7 modular components
- **Reusability**: Eliminated duplicate code, improved maintainability
- **Type safety**: Improved TypeScript type definitions

### Key Features

#### 1. Workspace Management
- Add folders as workspaces and manage multiple terminal sessions
- Each workspace has its own independent session list
- Per-workspace Git branch info display

#### 2. Playground
- Auto-generate temporary working directories (timestamp-based in Downloads folder)
- Isolated environment for quick experiments and testing

#### 3. Git Worktree Support
- **Worktrees managed as separate Workspaces**
  - Displayed in tree structure under parent workspace
  - Each worktree workspace can have multiple terminal sessions
  - Provides independent working environment
- **Auto-creation**: Enter branch name to automatically create worktree and add workspace
- **Auto-cleanup**: Deleting a worktree workspace runs `git worktree remove` and removes the directory

#### 4. GitHub Integration
- **Push to GitHub**: Push worktree branches directly to GitHub
- **Create PR**: Create Pull Requests (title and description input supported)
- **gh CLI Integration**: Authentication and operations via GitHub CLI
- **Workflow Status**: Check GitHub Actions workflow status

#### 5. Port Monitoring
- Real-time detection and display of local development server ports (macOS + Linux)
- Port filtering (min/max port settings)

#### 6. System Monitoring
- CPU, RAM, disk, battery, and uptime info via StatusBar
- Platform-specific collection: macOS (`top`), Linux (`/proc/stat`, `/proc/meminfo`)
- No background polling — only fetches when requested

#### 7. Session Persistence
- All terminal sessions remain in the DOM to preserve state across tab switches
- Inactive sessions hidden with `display: none`

#### 8. Custom Terminal Templates
- Save frequently used commands as templates
- Customize icon, name, description, and command
- Select template when creating new terminals

#### 9. Session Memo
- Independent notepad for each terminal session
- Quickly open/close via icon in top-right of terminal
- 500ms debounced auto-save (stored with session data in electron-store)
- Icon turns yellow when memo content exists
- Close instantly with Escape key
- Memo auto-deleted when session is removed (TerminalSession.memo field)

#### 10. Keyboard Shortcuts
- Fully configurable shortcuts via Settings > Keyboard
- Actions: new session, close session, switch workspace, toggle sidebar, etc.
- See `src/shared/types.ts` for `ShortcutAction` and `DEFAULT_SHORTCUTS`

### Data Flow

```
User Action (Renderer)
  → IPC Call (Preload)
    → IPC Handler (Main)
      → electron-store (Persistent Storage) / simple-git / gh CLI
        → Response to Renderer
          → UI Update
```

### Terminal Session Lifecycle

1. User requests session addition
2. Main process generates UUID and saves session info
3. Renderer creates TerminalView component
4. TerminalView calls `terminal-create` IPC on mount
5. TerminalManager creates node-pty process
6. pty data broadcast via `terminal-output-{id}` channel
7. TerminalView renders data via xterm.js

### Storage Schema (electron-store)

```typescript
{
  workspaces: [
    {
      id: string,
      name: string,
      path: string,
      sessions: [
        {
          id: string,
          name: string,
          cwd: string,
          type: 'regular' | 'worktree',
          memo?: string               // Session memo text
        }
      ],
      createdAt: number,
      isPlayground?: boolean,
      parentWorkspaceId?: string,  // Parent workspace ID for worktrees
      branchName?: string          // Worktree branch name
    }
  ],
  playgroundPath: string,
  customTemplates: TerminalTemplate[],
  settings: UserSettings,
  shortcuts: Record<ShortcutAction, string>  // Keyboard shortcuts
}
```

## Important Notes

### Cross-Platform Support

- **Port Monitoring**: macOS uses `lsof`, Linux uses `ss`/`netstat`. Not supported on Windows.
- **System Info**: macOS uses `top`, Linux reads `/proc/stat` and `/proc/meminfo`.
- **Vibrancy Effect**: macOS-only transparent glass UI effect
- **Default Shell**: macOS uses `zsh`, Linux uses `$SHELL` or `bash`, Windows uses `powershell.exe`

### External Command Execution (PATH Issue)

When launching from Finder/Spotlight or Linux desktop launcher, the app does not inherit terminal PATH.
External commands like `code`, `gh`, `git` must always be executed through a **login shell**.

```typescript
// Wrong - PATH not found when launched from Finder/desktop
import { exec } from 'child_process'
exec('code .')

// Correct - Load ~/.zshrc/.bashrc via login shell first
import { exec } from 'child_process'
exec('/bin/zsh -l -c "code ."')
```

The `execWithShell()` helper function handles this automatically (`src/main/index.ts`).

### Terminal Management

- All terminal sessions persist even when React components unmount (node-pty process remains)
- Session switching only hides with `display: none` to preserve terminal state
- Terminal resizing handled automatically via FitAddon

### Git Worktree

- **Workspace Structure**: Worktrees are created as separate workspaces linked via `parentWorkspaceId`
- **Directory Structure**: `{workspace-path}/../{workspace-name}-worktrees/{branch-name}`
- **Auto-cleanup**: `git worktree remove --force` runs when deleting worktree workspace
- **Multiple Sessions**: Each worktree workspace can have multiple terminal sessions
- **Branch Restriction**: Worktree creation fails if branch already exists

### GitHub Integration

- **gh CLI Required**: gh CLI must be installed and authenticated for GitHub features
- **Push**: Runs `git push origin <branch> --set-upstream`
- **PR Creation**: Uses `gh pr create` command, auto-pushes branch
- **Auth**: Check auth with `gh auth status`, login with `gh auth login --web`

### IPC Communication

#### Workspace Management
- `get-workspaces`: Get all workspaces
- `add-workspace`: Add workspace via folder selection dialog
- `add-worktree-workspace`: Create worktree workspace
- `remove-workspace`: Remove workspace (runs git worktree remove for worktrees)
- `add-session`: Add terminal session
- `remove-session`: Remove terminal session
- `update-session-memo`: Save session memo

#### Git Operations
- `git-list-branches`: List branches
- `git-checkout`: Checkout branch
- `git-status`: Get Git status
- `git-commit`, `git-push`, `git-pull`: Basic Git operations

#### GitHub Operations
- `gh-check-auth`: Check GitHub auth status
- `gh-push-branch`: Push branch
- `gh-create-pr-from-worktree`: Create PR from worktree
- `gh-list-prs`: List PRs
- `gh-workflow-status`: Check GitHub Actions status

#### System Operations
- `get-system-info`: Get CPU/RAM/disk/battery/uptime info

#### Communication Patterns
- **Invoke/Handle**: Async request-response pattern (workspace CRUD, Git operations)
- **Send/On**: One-way event stream (terminal input, port updates)
- Terminal data is broadcast to all BrowserWindows, so Renderer must filter by ID

### Build Configuration

- `electron-vite` bundles Main/Preload/Renderer separately
- Renderer supports Vite + React HMR
- Main/Preload use CommonJS module system (`type: "commonjs"`)

## Problem-Solving Approach

- Do **not** modify code immediately when a problem is reported
- Use **ultrathink** to analyze deeply:
  1. How the current code works
  2. Why the problem occurs (root cause)
  3. Full understanding of related code flow
  4. What parts are affected (side effects)
- After analysis, propose a fix plan and **get confirmation before modifying code**

## Development Guidelines

### Language Policy

- **Code & UI**: All code, variable names, comments, UI text, error messages, and logs MUST be written in **English**
- **Explanations**: When explaining code or providing guidance, use **Korean** for clarity
- **Documentation**: This CLAUDE.md uses English for descriptions; code remains in English

### Code Writing Precautions

1. **Component Size**: Keep single components under 300 lines
2. **Custom Hooks**: Extract complex logic into custom hooks
3. **Type Safety**: Explicit types for all props and states
4. **Reusability**: Extract duplicate code into utility functions or common components
5. **Comments**: Add JSDoc comments for complex logic

### Developer Tools

**Settings > Developer category (currently disabled)**
- Commented out in Settings.tsx
- Uncomment to enable when needed:
  ```typescript
  // Developer tools - uncomment to enable
  { id: 'developer' as const, label: 'Developer', icon: <Bug size={16} /> },
  ```

### Git Workflow

1. Create feature branch
2. After development, test build with `pnpm build`
3. Validate types with `pnpm typecheck`
4. Run tests with `pnpm test`
5. Commit & Push
6. Create Pull Request

### Debugging

- **Main Process**: `console.log` outputs to terminal
- **Renderer Process**: Use Chrome DevTools (F12)
- **IPC Communication**: Check logs on both Main and Renderer sides

## Future Improvements

- [x] Linux port monitoring support
- [x] Linux system info support
- [ ] Windows port monitoring support
- [ ] Terminal session bookmark feature
- [ ] Worktree auto-cleanup (auto-delete merged branches)
- [ ] GitHub PR review feature
- [ ] Terminal theme customization
- [ ] Multi-window support
- [ ] Session grouping and tag feature

## Keyboard Shortcuts

When adding new shortcuts, update **all 4 required files** (see `.claude/rules/keyboard-shortcut-checklist.md`):

1. `src/shared/types.ts` — add to `ShortcutAction`, `DEFAULT_SHORTCUTS`, `SHORTCUT_LABELS`
2. `src/renderer/src/hooks/useKeyboardShortcuts.ts` — add callback to config + handler
3. `src/renderer/src/App.tsx` — pass callback to `useKeyboardShortcuts()`
4. `CLAUDE.md` — update relevant sections
