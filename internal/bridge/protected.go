package bridge

import "github.com/sanyokkua/go_mark_edit/internal/apperr"

// Protect runs a non-handler callback and reports whether it panicked. The
// result-bearing boundary uses Guard; this variant is for infrastructure ports
// such as event emitters whose failure is returned through an existing error
// path rather than a Wails result envelope.
func Protect(run func()) (panicked bool) {
	var outcome struct{ apperr.Failure }
	func() {
		defer Guard(&outcome)
		run()
	}()
	return outcome.Category == apperr.ClassifiedInternal
}
