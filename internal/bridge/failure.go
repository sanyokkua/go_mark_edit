package bridge

import (
	"path/filepath"
	"strings"

	"github.com/sanyokkua/go_mark_edit/internal/apperr"
)

// Fail is the only classified-failure constructor used by bridge handlers.
// The subject is reduced to a safe basename by the existing apperr contract;
// causes and private paths never cross the bridge.
func Fail(category apperr.ClassifiedErrorCategory, subject, message string, remediation apperr.ClassifiedRemediation) apperr.Failure {
	classified := apperr.NewClassifiedError(category, safeSubject(subject), message, remediation, "")
	return apperr.Failure{
		Category:    classified.Category,
		Subject:     classified.SafeSubject,
		Message:     classified.Message,
		Remediation: classified.Remediation(),
	}
}

func safeSubject(subject string) string {
	if subject == "" {
		return ""
	}
	base := filepath.Base(strings.ReplaceAll(subject, "\\", "/"))
	if base == "." || base == "/" {
		return ""
	}
	return base
}
