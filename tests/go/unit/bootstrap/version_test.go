package bootstrap_test

import (
	. "github.com/sanyokkua/go_mark_edit/internal/bootstrap"
	"testing"
)

func TestVersionDefaultsToExactDev(t *testing.T) {
	if got := Version(); got != "dev" {
		t.Fatalf("development version = %q, want exact dev", got)
	}
}
