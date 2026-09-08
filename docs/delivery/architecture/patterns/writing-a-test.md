# Writing a test

Every rule in a feature file gets a test, and that test names the rule it proves on its first comment
line. The name is for a human reading a failure; nothing generates from it and nothing validates it.

```go
// Proves: opening-and-saving-files#crlf-is-preserved
func TestSavePreservesCarriageReturns(t *testing.T) { … }
```

```ts
// Proves: themes-and-appearance#auto-follows-the-system
it('switches to the dark palette when the OS switches while Auto is selected', async () => { … });
```

## Which kind of test

| Proving | Write | Runs with |
|---|---|---|
| a Go service or handler behaviour | `internal/<pkg>/<file>_test.go` | `just go-test` (`go test -race`) |
| an architecture invariant | `internal/<pkg>/architecture_test.go`, function name starting `TestArchitecture` | `just archtest` |
| a component's rendered behaviour | `frontend/src/**/<Name>.test.tsx` | `just frontend-test` (Jest + Testing Library) |
| a whole journey through the real UI | `frontend/tests/*.spec.ts` | `just e2e-test` (Playwright) |
| anything needing real bytes, two processes, a real provider, or the packaged binary | a numbered row in `../../plan/testing/live-plan.md` | a person, and the result is a dated report |

## Go

Table-driven, faked at the package's own interface, no real database:

```go
// Proves: settings#appearance-persists-immediately
func TestUpdateAppearancePersistsWithoutSave(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		input apperr.AppearanceSettings
		want  string
	}{
		{name: "material light", input: apperr.AppearanceSettings{Theme: "material", Mode: "light"}, want: "material"},
		{name: "glass auto", input: apperr.AppearanceSettings{Theme: "glass", Mode: "auto"}, want: "glass"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			repository := &fakeSettingsRepository{}
			service := NewSettingsService(repository)

			if err := service.UpdateAppearance(context.Background(), testCase.input); err != nil {
				t.Fatalf("update appearance: %v", err)
			}
			if repository.appearance.Theme != testCase.want {
				t.Errorf("persisted theme = %q, want %q", repository.appearance.Theme, testCase.want)
			}
		})
	}
}
```

The fake satisfies `SettingsRepositoryAPI`, which is declared in the package under test. Everything runs
under `-race`, which is not optional: `internal/appmodel` is mutex-guarded and the race detector is the
only thing that catches a path that forgot the lock.

## Frontend

Render the subject. Query the way a user finds things.

```tsx
// Proves: writing-in-the-editor#status-bar-counts-words
it('shows the word count for the active document', async () => {
	renderWithStore(<StatusBar wordCount={128} lineEnding="LF" encoding="UTF-8" />);

	expect(await screen.findByText('128 words')).toBeVisible();
});
```

- **Never mock the component under test.** `jest.mock('./AppShell')` inside `AppShell.test.tsx` proves
  that the mock works. This mistake is live in this repository today and is recorded in
  `../../plan/KNOWN_ISSUES.md`.
- **Mock at `logic/adapter`, never at `wailsjs/`.** The adapter is the seam the app itself uses, so a
  test that mocks it exercises the real call path.
- **Query by role, label or text** — `getByRole('button', { name: … })`, `getByLabelText`, `findByText`.
  Not by class name and not by test id. A query by role fails when the control stops being reachable,
  which is the failure worth catching.
- **Use `findBy*` and `waitFor` for anything async** — the preview is debounced and Mermaid renders
  asynchronously. A fixed timer is a flake waiting for a slow machine.

## What is not a test

- **Asserting on a document.** Story text, phase text, ADR contents, the `justfile`, CI configuration and
  anything under `.claude/` are not test subjects. Roughly 4,200 lines of exactly that were deleted from
  this repository on 2026-07-25, and one of those validators reported a phase complete while the suite
  was red.
- **Asserting that a symbol exists** or that a source file contains a string.
- **Asserting that a function was called**, without asserting what the user then sees.
- **A happy path with no precondition.** If the test cannot fail for an interesting reason, it is not
  measuring anything.

The one exception is the architecture invariants in `../rules.md`, which genuinely cannot be checked any
other way — an import direction, an absent `context.Context` parameter, a colour literal.

## Write the adversarial case

For anything with state or timing, the happy path is the case that already works. Cover instead:

- **mutate before the transition completes** — edit while a save is in flight;
- **out-of-order completion** — two commands returning in the wrong order;
- **remount and identity** — does the editor session survive a layout change;
- **retry after failure** — does the second attempt start from a clean state;
- **the boundary** — exactly at the limit, not comfortably inside it.

## Checklist

- [ ] First comment line is `Proves: <feature>#<anchor>`
- [ ] The subject is rendered or constructed, not mocked
- [ ] Collaborators faked at the package's own interface, or at `logic/adapter`
- [ ] Go tests table-driven where there are cases, and passing under `-race`
- [ ] Frontend queries by accessible role, label or text
- [ ] Async handled with `findBy*` / `waitFor`, never a fixed timer
- [ ] At least one case is on a boundary or an error path
- [ ] The assertion is what the user ends up seeing
