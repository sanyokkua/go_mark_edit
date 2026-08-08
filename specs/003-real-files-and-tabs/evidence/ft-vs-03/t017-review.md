# T017 review — activation-scoped editor sessions

Branch: `feature/v1-implementation--003-t017-activation-sessions`

The editor now creates a monotonically unique activation token and URI suffix for each document activation,
passes that token through the Monaco/editor-command session, disposes the outgoing model/editor at the activation
boundary, and registers the active session's unified content-and-view flush with the appmodel adapter. The adapter
uses that registration for imperative Save/switch drains and rejects a mismatched activation token. Activation
acknowledgements are accepted only for the winning request generation after the projected active identity,
projection revision, and document content revision all match.

Evidence:

- `npm --prefix frontend test -- --runInBand` — 58 suites / 306 tests passed.
- Named T017 coverage includes fresh activation model/URI disposal, failed outgoing flush retention, and late
  acknowledgement rejection; focused run passed 41 tests.
- `npm --prefix frontend run lint` — pass.
- `npm --prefix frontend run typecheck` — pass.
- `npm --prefix frontend run format:check` — pass.
- `GOCACHE=/private/tmp/gomarkedit-gocache just archtest` — pass, including CGO-free and frontend architecture checks.
- `GOCACHE=/private/tmp/gomarkedit-gocache just frontend-build` — pass; production network guard passed.

The full `just check` gate is run after the task commit so the generator and all repository gates are evaluated
against the committed T017 state.
