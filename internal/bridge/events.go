package bridge

// Event names are kept in one Go file so emitters and their adapters cannot
// drift in spelling.
const (
	EventStatePatch                = "state:patch"
	EventStateError                = "state:error"
	EventApplicationCloseRequested = "application:close-requested"
)
