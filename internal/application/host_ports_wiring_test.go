package application

import (
	"reflect"
	"testing"
)

// hostPortPackage is the package that declares the narrow host capabilities the
// composition root must supply. Every interface-typed AppModelService field whose
// type comes from here is a host port, so this scan discovers a port added later
// without anyone remembering to extend this test.
const hostPortPackage = "github.com/sanyokkua/go_mark_edit/internal/file"

// Proves: FR-FT-037 — only the clause that Copy path and Reveal in file manager
// reach a host at all in a production build. The menu ordering, availability and
// announcement clauses are proved elsewhere.
//
// This is the defect T161 fixed: NewApplicationContextHolder built the document
// model without a clipboard writer or a reveal port, so both fields were nil in
// every shipped binary and both commands returned system-command-failure on every
// invocation. No Go unit test saw it, because they inject their own ports; no
// Playwright suite saw it, because the dev bridge reimplements both in TypeScript.
// Only the real composition root can be asked.
func TestHostPortsAreNonNilInTheProductionCompositionRoot(t *testing.T) {
	holder := NewApplicationContextHolder(nil, nil)
	if holder.AppModelService == nil {
		t.Fatal("composition root produced no document model service")
	}

	service := reflect.ValueOf(holder.AppModelService).Elem()
	serviceType := service.Type()

	discovered := 0
	for index := range serviceType.NumField() {
		field := serviceType.Field(index)
		if field.Type.Kind() != reflect.Interface || field.Type.PkgPath() != hostPortPackage {
			continue
		}
		discovered++
		// IsNil is legal on an unexported field; only Interface() is not.
		if service.Field(index).IsNil() {
			t.Errorf("host port %s (%s) is nil: the composition root never injected it, so the command that uses it cannot work in a shipped binary", field.Name, field.Type.String())
		}
	}

	// A scan that matched nothing has not passed, it has failed to look. Both
	// known host ports must be found, so a rename that silently empties this
	// scan is a failure rather than a green run over zero fields.
	if discovered < 2 {
		t.Fatalf("host port scan discovered %d ports from %s, expected at least 2 (clipboard writer and reveal port)", discovered, hostPortPackage)
	}
}
