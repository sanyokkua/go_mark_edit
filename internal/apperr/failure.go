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

// ClassifiedValidation and ClassifiedInternal are the vocabulary names used
// by bridge callers. They intentionally remain outside the domain-classified
// error table: validation and panic failures are bridge protocol failures.
const (
	ClassifiedValidation ClassifiedErrorCategory = "validation"
	ClassifiedInternal   ClassifiedErrorCategory = "internal"
)
