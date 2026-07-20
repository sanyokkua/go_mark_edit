package gate

import "testing"

// Proves: STORY-003-AC-3
// A held generic gate rejects a concurrent acquisition with false; handlers map that to apperr.Busy.
func TestGateRejectsConcurrentAcquisition(t *testing.T) {
	t.Parallel()

	operationGate := New()
	releaseLongOperation := make(chan struct{})
	longOperationAcquired := make(chan bool, 1)
	longOperationFinished := make(chan struct{})
	go func() {
		defer close(longOperationFinished)
		longOperationAcquired <- operationGate.TryAcquire()
		<-releaseLongOperation
		operationGate.Release()
	}()

	if !<-longOperationAcquired {
		t.Fatal("long operation did not acquire an unheld gate")
	}
	if operationGate.TryAcquire() {
		t.Fatal("concurrent operation acquired an already-held gate")
	}

	close(releaseLongOperation)
	<-longOperationFinished
	if !operationGate.TryAcquire() {
		t.Fatal("gate did not become available after the long operation released it")
	}
	operationGate.Release()
	operationGate.Release()
	if !operationGate.TryAcquire() {
		t.Fatal("idempotent release did not leave the gate available")
	}
	operationGate.Release()
}
