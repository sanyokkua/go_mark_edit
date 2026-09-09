package apperr

// Failure is the shared, cause-free failure envelope carried by every bound
// result. The bridge owns construction; keeping this value in apperr lets the
// result types remain at the bottom of the import graph.
type Failure struct {
	Category    ClassifiedErrorCategory `json:"category,omitempty"`
	Subject     string                  `json:"subject,omitempty"`
	Message     string                  `json:"message,omitempty"`
	Remediation ClassifiedRemediation   `json:"remediation,omitempty"`
	ID          string                  `json:"id,omitempty"`
}

// FailureCategoryValidation is the safe category used when a bridge request
// is missing its required identity.
const FailureCategoryValidation ClassifiedErrorCategory = "validation"

// FailureCategoryInternal is the safe category used when a bound handler
// panics at the bridge boundary.
const FailureCategoryInternal ClassifiedErrorCategory = "internal"

// ClassifiedValidation and ClassifiedInternal are the vocabulary names used
// by bridge callers. They intentionally remain outside the domain-classified
// error table: validation and panic failures are bridge protocol failures.
const (
	ClassifiedValidation = FailureCategoryValidation
	ClassifiedInternal   = FailureCategoryInternal
)
