# Tasks

## 1. Foundations

- [x] 1.1 Record the feature baseline before the first edit
- [x] 1.2 Add the needed icons and apply the sidebar terminology rename
- [x] 1.3 Generalize the recent-files list to Recent Items (files and folders, cap 10, versioned JSON v2)
- [x] 1.4 Add the workspace tree builder, session state and lifecycle commands in `internal/workspace` and `internal/appmodel`
- [x] 1.5 Add the new-window launcher and startup folder argument
- [x] 1.6 Add the workspace slice and adapter surface in the frontend

## 2. Open a folder and browse it

- [x] 2.1 Add the folder picker and hidden-folders setter
- [x] 2.2 Build folder open, close and replace orchestration and its prompts
- [x] 2.3 Build the sidebar tree container (loading, empty, unavailable and truncated states) and the tree rows with keyboard model
- [x] 2.4 Cover the story with integration and E2E tests (`workspace-tree.test.ts`)

## 3. Recent work

- [x] 3.1 Add recent-items commands, Clear Recent and the Reopen Last fallback
- [x] 3.2 Rebuild the Open Recent submenu and Reopen Last routing; cover with E2E tests

## 4. Drag and drop

- [x] 4.1 Add drop classification and enable native file drop
- [x] 4.2 Build the window drop target and drop orchestration; verify in the running app

## 5. Multiple windows

- [x] 5.1 Add the New Window command surface; verify two independent windows in the running app

## 6. Create and reveal

- [x] 6.1 Add workspace create, reveal and copy-path commands
- [x] 6.2 Build the tree context menu and create-entry dialog; cover with E2E tests

## 7. Documentation and close

- [x] 7.1 Record the architecture in `docs/architecture.md` and update project instructions
- [x] 7.2 Run the six verification stages, baseline comparison and packaged-app walkthrough with zero findings
