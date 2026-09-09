package main

// Architecture tests. These scan source rather than exercising behaviour, which is permitted only
// for the invariants in docs/delivery/architecture/rules.md — they cannot be checked any other way.
//
// Every function here starts with TestArchitecture, because `just archtest` selects them with
// `go test -run TestArchitecture`.

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

// repositoryRoot resolves the module root from this file's own location.
func repositoryRoot(t *testing.T) string {
	t.Helper()

	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate architecture test source")
	}
	return filepath.Dir(sourceFile)
}

// goSourceFiles lists every non-generated, non-test .go file under root, excluding the directories
// named in skip (matched as path prefixes relative to root).
func goSourceFiles(t *testing.T, root string, skip ...string) []string {
	t.Helper()

	var files []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return relErr
		}
		if entry.IsDir() {
			base := entry.Name()
			if base == "node_modules" || base == ".git" || base == "build" || base == "frontend" {
				return filepath.SkipDir
			}
			for _, prefix := range skip {
				if relative == prefix || strings.HasPrefix(relative, prefix+string(filepath.Separator)) {
					return filepath.SkipDir
				}
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		files = append(files, path)
		return nil
	})
	if err != nil {
		t.Fatalf("walk %s: %v", root, err)
	}
	return files
}

func parseGo(t *testing.T, path string) *ast.File {
	t.Helper()

	parsed, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ParseComments)
	if err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	return parsed
}

func importPath(spec *ast.ImportSpec) string {
	return strings.Trim(spec.Path.Value, "`\"")
}

// receiverTypeName returns the receiver's type name for a method, or "" for a plain function.
func receiverTypeName(decl *ast.FuncDecl) string {
	if decl.Recv == nil || len(decl.Recv.List) == 0 {
		return ""
	}
	expr := decl.Recv.List[0].Type
	if star, ok := expr.(*ast.StarExpr); ok {
		expr = star.X
	}
	identifier, ok := expr.(*ast.Ident)
	if !ok {
		return ""
	}
	return identifier.Name
}

// boundMethods yields every exported method on a type whose name ends in "Handler". Those types are
// the ones passed to Bind in main.go, and the rules below apply to all of them.
func boundMethods(t *testing.T, root string) map[string][]*ast.FuncDecl {
	t.Helper()

	found := make(map[string][]*ast.FuncDecl)
	for _, path := range goSourceFiles(t, filepath.Join(root, "internal")) {
		parsed := parseGo(t, path)
		for _, declaration := range parsed.Decls {
			function, ok := declaration.(*ast.FuncDecl)
			if !ok || !function.Name.IsExported() {
				continue
			}
			if !strings.HasSuffix(receiverTypeName(function), "Handler") {
				continue
			}
			found[path] = append(found[path], function)
		}
	}
	return found
}

// Proves: architecture#handler-returns-a-result
func TestArchitectureBoundHandlersReturnAResult(t *testing.T) {
	t.Parallel()

	root := repositoryRoot(t)
	total := 0
	for path, methods := range boundMethods(t, root) {
		for _, method := range methods {
			total++
			results := method.Type.Results
			if results == nil || len(results.List) != 1 || len(results.List[0].Names) != 1 {
				t.Errorf("%s: %s must return exactly one named result", path, method.Name.Name)
				continue
			}
			selector, ok := results.List[0].Type.(*ast.SelectorExpr)
			if !ok {
				t.Errorf("%s: %s must return an apperr.*Result value", path, method.Name.Name)
				continue
			}
			pkg, _ := selector.X.(*ast.Ident)
			if pkg == nil || pkg.Name != "apperr" || !strings.HasSuffix(selector.Sel.Name, "Result") {
				t.Errorf("%s: %s returns %v, want an apperr.*Result value", path, method.Name.Name, selector.Sel.Name)
			}
		}
	}
	if total == 0 {
		t.Fatal("found no bound handler methods to check — the discovery rule is wrong")
	}
}

// Proves: architecture#bound-handlers-take-no-context
func TestArchitectureBoundHandlersTakeNoContext(t *testing.T) {
	t.Parallel()

	root := repositoryRoot(t)
	for path, methods := range boundMethods(t, root) {
		for _, method := range methods {
			if method.Type.Params == nil {
				continue
			}
			for _, parameter := range method.Type.Params.List {
				selector, ok := parameter.Type.(*ast.SelectorExpr)
				if !ok {
					continue
				}
				pkg, _ := selector.X.(*ast.Ident)
				if pkg != nil && pkg.Name == "context" && selector.Sel.Name == "Context" {
					t.Errorf("%s: %s takes a context.Context — Wails strips it and the binding arity then disagrees",
						path, method.Name.Name)
				}
			}
		}
	}
}

// Proves: architecture#panic-becomes-internal-error
func TestArchitectureBoundHandlersRecoverPanics(t *testing.T) {
	t.Parallel()

	root := repositoryRoot(t)
	for path, methods := range boundMethods(t, root) {
		for _, method := range methods {
			if method.Body == nil || len(method.Body.List) == 0 {
				t.Errorf("%s: %s has no body", path, method.Name.Name)
				continue
			}
			deferStatement, ok := method.Body.List[0].(*ast.DeferStmt)
			if !ok {
				t.Errorf("%s: %s does not begin with a deferred recover", path, method.Name.Name)
				continue
			}
			if !containsRecoverCall(deferStatement) && !containsBridgeGuardCall(deferStatement) {
				t.Errorf("%s: %s defers neither the shared bridge guard nor recover()", path, method.Name.Name)
			}
		}
	}
}

func containsBridgeGuardCall(node ast.Node) bool {
	found := false
	ast.Inspect(node, func(inner ast.Node) bool {
		call, ok := inner.(*ast.CallExpr)
		if !ok {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || selector.Sel.Name != "Guard" {
			return true
		}
		packageName, ok := selector.X.(*ast.Ident)
		if ok && packageName.Name == "bridge" {
			found = true
			return false
		}
		return true
	})
	return found
}

func containsRecoverCall(node ast.Node) bool {
	found := false
	ast.Inspect(node, func(inner ast.Node) bool {
		call, ok := inner.(*ast.CallExpr)
		if !ok {
			return true
		}
		if identifier, ok := call.Fun.(*ast.Ident); ok && identifier.Name == "recover" {
			found = true
			return false
		}
		return true
	})
	return found
}

// The apperr import direction is checked in package apperr itself, by
// internal/apperr/architecture_test.go — it is closer to the code it governs and it runs there.

// crossPackageConstructor matches a call such as settings.NewSqliteSettingsRepository(...).
var crossPackageConstructor = regexp.MustCompile(`^New.*(Service|Repository|Handler)$`)

// Proves: architecture#one-composition-root
func TestArchitectureOnlyTheCompositionRootWiresConcretes(t *testing.T) {
	t.Parallel()

	root := repositoryRoot(t)
	paths := goSourceFiles(t, filepath.Join(root, "internal"), "application")
	paths = append(paths, filepath.Join(root, "main.go"))

	for _, path := range paths {
		if filepath.Base(path) == "main.go" && filepath.Dir(path) == root {
			continue // main.go is the outer half of the composition root
		}
		parsed := parseGo(t, path)
		ast.Inspect(parsed, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			selector, ok := call.Fun.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			pkg, _ := selector.X.(*ast.Ident)
			if pkg == nil || pkg.Name == "apperr" {
				return true
			}
			if crossPackageConstructor.MatchString(selector.Sel.Name) {
				t.Errorf("%s constructs %s.%s — concrete wiring belongs in internal/application",
					path, pkg.Name, selector.Sel.Name)
			}
			if pkg.Name == "db" && selector.Sel.Name == "Open" {
				t.Errorf("%s calls db.Open — the database is opened once, in internal/application's Init", path)
			}
			return true
		})
	}
}

var destructiveSQL = regexp.MustCompile(`(?i)\b(DROP\s+(TABLE|INDEX|VIEW|COLUMN)|ALTER\s+TABLE\s+\S+\s+DROP|UPDATE\s+\S+\s+SET|DELETE\s+FROM)\b`)

// Proves: architecture#migrations-only-add
func TestArchitectureMigrationsOnlyAdd(t *testing.T) {
	t.Parallel()

	root := repositoryRoot(t)
	directory := filepath.Join(root, "internal", "db", "migrations")
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatalf("read migrations directory: %v", err)
	}
	checked := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		path := filepath.Join(directory, entry.Name())
		content, readErr := os.ReadFile(path)
		if readErr != nil {
			t.Fatalf("read %s: %v", path, readErr)
		}
		checked++
		for _, line := range strings.Split(string(content), "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "--") {
				continue
			}
			if destructiveSQL.MatchString(trimmed) {
				t.Errorf("%s: %q — migrations add only. A correction is a new numbered file.", path, trimmed)
			}
		}
	}
	if checked == 0 {
		t.Fatal("found no migrations to check")
	}
}

// Proves: architecture#no-single-instance-lock
// Proves: architecture#no-background-network
func TestArchitectureNoSingleInstanceOrNetworkPath(t *testing.T) {
	t.Parallel()

	root := repositoryRoot(t)
	// internal/llm is where the assistant's user-invoked provider client will live. It is the one
	// package permitted an HTTP client, and it does not exist yet.
	paths := goSourceFiles(t, filepath.Join(root, "internal"), "llm")
	paths = append(paths, filepath.Join(root, "main.go"))

	for _, path := range paths {
		parsed := parseGo(t, path)
		for _, spec := range parsed.Imports {
			if forbiddenNetworkOrLockImport(importPath(spec)) {
				t.Errorf("%s imports %q — the app makes no background network call and takes no instance lock",
					path, importPath(spec))
			}
		}
		ast.Inspect(parsed, func(node ast.Node) bool {
			selector, ok := node.(*ast.SelectorExpr)
			if !ok || !forbiddenNetworkOrLockSelector(selector) {
				return true
			}
			base, _ := selector.X.(*ast.Ident)
			name := ""
			if base != nil {
				name = base.Name
			}
			t.Errorf("%s uses %s.%s — the app makes no background network call and takes no instance lock",
				path, name, selector.Sel.Name)
			return true
		})
	}
}

func forbiddenNetworkOrLockImport(path string) bool {
	if path == "net" || strings.HasPrefix(path, "net/") {
		// net/http is permitted only inside internal/llm, which this walk excludes.
		return true
	}
	return strings.Contains(path, "flock") ||
		strings.Contains(path, "lockfile") ||
		strings.Contains(path, "singleinstance")
}

func forbiddenNetworkOrLockSelector(selector *ast.SelectorExpr) bool {
	base, _ := selector.X.(*ast.Ident)
	if base == nil {
		return false
	}
	switch base.Name {
	case "net":
		return selector.Sel.Name == "Dial" || selector.Sel.Name == "DialTimeout" || selector.Sel.Name == "Listen"
	case "http":
		return selector.Sel.Name == "Get" || selector.Sel.Name == "Post" ||
			selector.Sel.Name == "ListenAndServe" || selector.Sel.Name == "ListenAndServeTLS"
	case "syscall", "unix":
		return selector.Sel.Name == "Flock"
	case "os":
		return selector.Sel.Name == "O_EXCL"
	}
	return false
}

// Proves: architecture#documents-have-identity
func TestArchitectureDocumentsHaveAnIdentityAndAContentAccessor(t *testing.T) {
	t.Parallel()

	root := repositoryRoot(t)
	hasIdentityStruct := false
	hasReadSeam := false

	for _, path := range goSourceFiles(t, filepath.Join(root, "internal", "appmodel")) {
		ast.Inspect(parseGo(t, path), func(node ast.Node) bool {
			spec, ok := node.(*ast.TypeSpec)
			if !ok {
				return true
			}
			switch definition := spec.Type.(type) {
			case *ast.StructType:
				fields := map[string]bool{}
				for _, field := range definition.Fields.List {
					for _, name := range field.Names {
						fields[name.Name] = true
					}
				}
				if fields["DocumentID"] && fields["Content"] {
					hasIdentityStruct = true
				}
			case *ast.InterfaceType:
				for _, method := range definition.Methods.List {
					function, ok := method.Type.(*ast.FuncType)
					if !ok || function.Results == nil {
						continue
					}
					for _, result := range function.Results.List {
						if identifier, ok := result.Type.(*ast.Ident); ok && strings.Contains(identifier.Name, "Snapshot") {
							hasReadSeam = true
						}
					}
				}
			}
			return true
		})
	}

	if !hasIdentityStruct {
		t.Error("internal/appmodel declares no struct carrying both DocumentID and Content — " +
			"a document's identity must be distinct from its path, and its text must be reached through the model")
	}
	if !hasReadSeam {
		t.Error("internal/appmodel declares no interface returning a document snapshot — " +
			"the content accessor is the seam every later feature reads through")
	}
}

// Proves: FR-FT-008 — the clause that Save "MUST never read the value directly
// from the visible editor widget". The other half of the requirement, "first
// accept the newest pending identity-bound working copy, then write only the
// backend's canonical content", is proved behaviourally by
// `frontend/e2e/real-files-and-tabs.test.ts` and by the write-path tests in
// `internal/appmodel`.
//
// "Never" is a seam rule, and a seam rule can only be checked where the seam
// is: the shape of the bridge. This asserts that the webview has exactly one
// way to hand document text to Go — `UpdateBuffer`, the flush command — and
// that no write command has a parameter it could smuggle editor text through.
// A `Save(documentID, content)` binding would make the rule unenforceable by
// any amount of care in the frontend, because the widget's value would be an
// argument the backend is handed rather than a value it owns.
//
// Behaviour cannot substitute for this. A Save that happened to write the
// backend's canonical content would pass every content assertion while the
// binding still accepted the widget's text, and the next caller would use it.
func TestArchitectureOnlyTheFlushCommandCarriesDocumentContent(t *testing.T) {
	t.Parallel()

	// Parameter names that carry a document's text across the bridge. Names are
	// what a binding exposes to the webview, so names are what is checked.
	contentParameters := map[string]bool{"content": true, "text": true, "value": true, "buffer": true, "source": true, "body": true}
	// The one command whose entire purpose is to accept the working copy.
	const flushCommand = "UpdateBuffer"

	root := repositoryRoot(t)
	carriers := map[string][]string{}
	sawFlushCommand := false
	sawSave := false

	for path, functions := range boundMethods(t, root) {
		for _, function := range functions {
			switch function.Name.Name {
			case flushCommand:
				sawFlushCommand = true
			case "Save", "SaveAs":
				sawSave = true
			}
			if function.Type.Params == nil {
				continue
			}
			for _, parameter := range function.Type.Params.List {
				for _, name := range parameter.Names {
					if !contentParameters[strings.ToLower(name.Name)] {
						continue
					}
					if function.Name.Name == flushCommand {
						continue
					}
					carriers[function.Name.Name] = append(carriers[function.Name.Name],
						filepath.Base(path)+": "+name.Name)
				}
			}
		}
	}

	if !sawFlushCommand {
		t.Fatalf("no bound %s command found — this test is scanning the wrong surface", flushCommand)
	}
	if !sawSave {
		t.Fatal("no bound Save or SaveAs command found — this test is scanning the wrong surface")
	}
	for command, parameters := range carriers {
		t.Errorf("bound command %s accepts document content across the bridge (%v) — "+
			"FR-FT-008 makes %s the only command that may carry a working copy, so that a write "+
			"can only ever use the backend's canonical content", command, parameters, flushCommand)
	}
}

/*
T162. The classified error contract permits each category only its own
remediations, and `permittedRemediations` silently drops a forbidden member on
the way out. That coercion is a net, not the mechanism — it was added as one —
so nothing reaches a user wrongly, but the source states an intent the contract
refuses and a reader cannot tell which sites meant "message-only" and which are
mistakes the net happens to be catching. The next call site copied from one of
them inherits the error.

This makes the coercion unreachable rather than load-bearing: a pairing the
contract forbids now fails here, at the literal, instead of being quietly
repaired at run time.

Matched by shape rather than by function name, because the literals are rarely
at `NewClassifiedError` itself — they are at the helpers that wrap it
(`refusedWrite`, `classifiedOpenError`, `conflictRefusedLabelled`, and others).
Any call that passes both a category literal and a remediation literal is
stating a pairing, whichever function it is calling.
*/
func TestArchitectureClassifiedRemediationsMatchTheirCategory(t *testing.T) {
	// The contract's table, restated here deliberately. A test that imported
	// `remediationsByCategory` would pass whatever that map happened to say,
	// including a mistake in the map itself; this is the spec's own row set.
	permitted := map[string]map[string]bool{
		"ClassifiedNotFound": {
			"RemediationSaveToRecreate": true,
			"RemediationCopyPath":       true,
		},
		"ClassifiedPermissionDenied": {},
		"ClassifiedIOFailure":        {"RemediationRetry": true},
		"ClassifiedConflict": {
			"RemediationReloadFromDisk": true,
			"RemediationKeepMine":       true,
			"RemediationSkip":           true,
			"RemediationCancel":         true,
			"RemediationRetry":          true,
		},
		"ClassifiedCapacityLimit": {},
		"ClassifiedSystemCommandFailure": {
			"RemediationRetry":    true,
			"RemediationCopyPath": true,
		},
		"ClassifiedUnsupported":   {},
		"ClassifiedPersistence":   {"RemediationRetry": true},
		"ClassifiedValidation":    {},
		"ClassifiedInternalError": {"RemediationRetry": true},
	}

	root := repositoryRoot(t)
	var findings []string
	for _, path := range goSourceFiles(t, filepath.Join(root, "internal")) {
		file := parseGo(t, path)
		fileSet := token.NewFileSet()
		reparsed, err := parser.ParseFile(fileSet, path, nil, parser.ParseComments)
		if err != nil {
			t.Fatalf("reparse %s: %v", path, err)
		}
		_ = file
		ast.Inspect(reparsed, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}
			var categories, remediations []string
			for _, argument := range call.Args {
				name := apperrSelectorName(argument)
				switch {
				case strings.HasPrefix(name, "Classified"):
					categories = append(categories, name)
				case strings.HasPrefix(name, "Remediation"):
					remediations = append(remediations, name)
				}
			}
			if len(categories) != 1 || len(remediations) == 0 {
				return true
			}
			category := categories[0]
			allowed, known := permitted[category]
			if !known {
				return true
			}
			for _, remediation := range remediations {
				// RemediationNone is "message-only" and is legal everywhere: it
				// requests nothing, so it can contradict no row.
				if remediation == "RemediationNone" || allowed[remediation] {
					continue
				}
				position := fileSet.Position(call.Pos())
				findings = append(findings, fmt.Sprintf(
					"%s:%d pairs %s with %s, which its row forbids",
					mustRelative(t, root, position.Filename), position.Line, category, remediation,
				))
			}
			return true
		})
	}
	if len(findings) != 0 {
		t.Fatalf("%d call site(s) request a remediation their category forbids:\n%s",
			len(findings), strings.Join(findings, "\n"))
	}
}

// apperrSelectorName reports the identifier of an `apperr.X` qualified reference,
// or "" for anything else. Only a literal states a pairing; a variable does not.
func apperrSelectorName(expression ast.Expr) string {
	selector, ok := expression.(*ast.SelectorExpr)
	if !ok {
		return ""
	}
	packageIdent, ok := selector.X.(*ast.Ident)
	if !ok || packageIdent.Name != "apperr" {
		return ""
	}
	return selector.Sel.Name
}

func mustRelative(t *testing.T, root, path string) string {
	t.Helper()

	relative, err := filepath.Rel(root, path)
	if err != nil {
		return path
	}
	return relative
}
