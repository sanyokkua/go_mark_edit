package bootstrap

// version is replaced through Go's -ldflags -X at release build time. The
// development fallback is deliberately exact so there is one identity source.
var version = "dev"

func Version() string { return version }
