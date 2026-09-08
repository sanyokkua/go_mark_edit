package bootstrap

import "testing"

func TestVersionDefaultsToExactDev(t *testing.T) {
	if got := Version(); got != "dev" {
		t.Fatalf("development version = %q, want exact dev", got)
	}
}

func TestVersionReturnsLinkTimeInjectedIdentityExactly(t *testing.T) {
	previous := version
	t.Cleanup(func() { version = previous })
	version = "2.7.4-test+injected"

	if got := Version(); got != "2.7.4-test+injected" {
		t.Fatalf("injected version = %q, want exact link-time value", got)
	}
}
