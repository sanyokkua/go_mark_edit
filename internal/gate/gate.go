// Package gate provides a process-local single-flight guard for long operations.
package gate

// Gate is a non-blocking, single-slot semaphore.
type Gate struct {
	ch chan struct{}
}

// New creates an unheld gate.
func New() *Gate {
	return &Gate{ch: make(chan struct{}, 1)}
}

// TryAcquire holds the gate when it is free and reports whether acquisition succeeded.
func (gate *Gate) TryAcquire() bool {
	select {
	case gate.ch <- struct{}{}:
		return true
	default:
		return false
	}
}

// Release frees the gate. Releasing an already-free gate is safe.
func (gate *Gate) Release() {
	select {
	case <-gate.ch:
	default:
	}
}
