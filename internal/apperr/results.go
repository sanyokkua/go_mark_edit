package apperr

// VoidResult is the envelope for a successful operation with no payload.
type VoidResult struct {
	Error *WireError `json:"error,omitempty"`
}

// StringResult is the envelope for a single string payload.
type StringResult struct {
	Data  string     `json:"data"`
	Error *WireError `json:"error,omitempty"`
}
