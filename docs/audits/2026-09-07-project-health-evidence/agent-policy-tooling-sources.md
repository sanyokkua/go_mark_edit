# Current tooling guidance checked for the agent/configuration audit

Checked 8 September 2026 against primary documentation. These references support proposed enforcement choices;
they do not establish that the repository already enables the checks or authorize a dependency upgrade.

| Source | Relevant guidance and limit |
| --- | --- |
| [typescript-eslint: linting with type information](https://typescript-eslint.io/getting-started/typed-linting/) | Typed rules require a type-aware preset and parser access to TypeScript project information. This supports evaluating the existing untyped lint configuration; enablement must use the actual source/test project boundaries and account for execution cost. |
| [typescript-eslint: no-floating-promises](https://typescript-eslint.io/rules/no-floating-promises/) | A typed rule can detect unhandled promise usage. This does not prove asynchronous work completes, cancellation reaches Go, or a native window can close. Intentional fire-and-forget work still needs a defined error/lifecycle policy. |
| [TypeScript: moduleResolution](https://www.typescriptlang.org/tsconfig/moduleResolution) | Resolution mode should match the execution/build environment. `bundler` supports package exports/imports for bundler consumers. The frontend's legacy `Node` resolution merits a Vite-compatible review; test and Node-tool configs must retain their own correct resolution behavior. |
| [React: eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks) | The recommended rules cover mechanical React constraints beyond hook call ordering. Inspect the installed effective rule set before asserting a check is missing or adding a duplicate prose rule. |
| [React: you might not need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | Effects synchronize with external systems. Derivable render data and user-event commands often have simpler owners. Whether Monaco/Wails synchronization genuinely needs an Effect is design judgment, not a blanket ban on Effects. |
| [Go: gopls analyzers](https://go.dev/gopls/analyzers) | Go's analyzer ecosystem covers concrete bug patterns and some simplifications. Select useful diagnostics compatible with the declared toolchain; an analyzer result is not a proof of SOLID or sound lifecycle ownership. |
| [Go tooling: modernize](https://pkg.go.dev/golang.org/x/tools/gopls/internal/analysis/modernize) | Go tooling includes suggestions for clearer use of modern language features. No modernizer was installed or executed in this review; this is a candidate for deliberate tooling evaluation, not a proposed mandatory upgrade or new gate. |
| [Stylelint: declaration-property-value-disallowed-list](https://stylelint.io/user-guide/rules/declaration-property-value-disallowed-list/) | Parsed CSS declarations can enforce defined property/value restrictions. A project-specific token policy still needs appropriate configuration and separate treatment of inline TS/JS styles; merely installing Stylelint would not prove all six themes are correct. |

“Current idioms” means clear, supported approaches for the project's declared language/runtime versions. It does not
mean installing `latest` on every run, rewriting working code for new syntax, adding interfaces for every type, or
enabling every optional lint rule. Product behavior, supported desktop webviews, maintainability and reproducible
builds remain the reasons for a modernization change.
