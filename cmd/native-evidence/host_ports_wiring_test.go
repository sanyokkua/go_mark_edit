//go:build native_evidence

package main

import (
	"reflect"
	"testing"

	"github.com/sanyokkua/go_mark_edit/internal/application"
)

// hostPortPackage mirrors the constant in internal/application's twin of this
// test. Every interface-typed AppModelService field whose type comes from here
// is a host port, so this scan discovers a port added later without anyone
// remembering to extend either copy.
const hostPortPackage = "github.com/sanyokkua/go_mark_edit/internal/file"

// Proves: FR-FT-037 — the clause that Copy path and Reveal in file manager reach
// a host at all, for the one host that is not the shipped binary.
//
// T161 fixed the composition root and proved it there. This driver was the
// remaining construction site that could silently omit a host port, and it did:
// configureNativeEvidenceDependencies built its own model through the harness
// constructor and assigned it over holder.AppModelService, discarding the
// correctly-wired one. Nothing failed, because the evidence scenarios never
// invoke CopyPath or RevealInFileManager — which is exactly what makes a
// standing assertion worth more here than a passing run.
//
// This test necessarily lives in cmd/native-evidence under the native_evidence
// tag, because the driver is package main behind that tag and internal's copy
// cannot reach configureNativeEvidenceDependencies. It therefore runs only under
// `just release-stack`, never under `just check` or CI. That asymmetry is why
// the fix is a wiring change rather than only this assertion: routing the driver
// through the same model the holder builds means a port added to
// NewAppModelServiceForHost reaches it by construction, and this test is the
// guard against the overwrite coming back rather than the only thing holding
// the ports in place.
func TestNativeEvidenceDriverKeepsTheCompositionRootHostPorts(t *testing.T) {
	holder := application.NewApplicationContextHolder(nil, nil)
	// pending-close only swaps the layout timer, so it needs no database
	// directory and no scenario recorder. The wiring under test is shared by
	// every scenario.
	configureNativeEvidenceDependencies(holder, "pending-close")

	if holder.AppModelService == nil {
		t.Fatal("evidence driver left the holder with no document model service")
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
			t.Errorf("host port %s (%s) is nil after configureNativeEvidenceDependencies: the evidence driver is measuring a model the shipped binary does not build", field.Name, field.Type.String())
		}
	}

	// A scan that matched nothing has not passed, it has failed to look. The
	// floor travels with the scan wherever it is copied.
	if discovered < 2 {
		t.Fatalf("host port scan discovered %d ports from %s, expected at least 2 (clipboard writer and reveal port)", discovered, hostPortPackage)
	}
}

// Proves: Constitution III — "concrete wiring MUST remain in the single
// application composition root" — for the evidence driver.
//
// The host-port scan above is the symptom; this is the cause, and it is why the
// fix is "stop replacing the model" rather than "also set the two ports". The
// holder binds settingsService's autosave and default-open-mode observers to the
// model it builds (application_context_holder.go). Replacing that model left
// both observers pointed at a discarded object, so in the evidence driver the
// autosave-enabled preference and the default open mode silently did nothing —
// in the very binary whose purpose is to measure autosave. Any future dependency
// the root joins to the model fails the same way, silently, for the same reason.
//
// Asserting identity rather than driving the observers is deliberate. Driving
// them means UpdateFile, which needs a settings repository and therefore a
// database, and the resulting test would prove the observer fires rather than
// the thing that broke — that the driver kept the root's model. What this cannot
// see, stated plainly: that the observers were bound correctly in the first
// place. internal/application owns that.
func TestNativeEvidenceDriverDoesNotReplaceTheCompositionRootModel(t *testing.T) {
	holder := application.NewApplicationContextHolder(nil, nil)
	built := holder.AppModelService
	if built == nil {
		t.Fatal("composition root produced no document model service")
	}

	configureNativeEvidenceDependencies(holder, "pending-close")

	if holder.AppModelService != built {
		t.Error("the evidence driver replaced the composition root's document model: every dependency the root joined to it — the host ports, the autosave observer, the default-open-mode observer — is now bound to a discarded object, and nothing else reports that")
	}
}
