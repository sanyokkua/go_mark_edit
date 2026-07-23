package appmodel

import (
	"context"
	"testing"
)

// Proves: STORY-029-AC-5
// PH09 and PH12 consumers depend only on the canonical active-document accessor contract.
func TestSnapshotActiveAccessorCompilesForPH09AndPH12Consumers(t *testing.T) {
	service, want := savedDocumentFixture()
	consumers := []struct {
		name    string
		consume func(context.Context, DocumentContentAccessor) (DocumentSnapshot, error)
	}{
		{name: "PH09 asset consumer", consume: ph09DocumentConsumer{}.Consume},
		{name: "PH12 action consumer", consume: ph12DocumentConsumer{}.Consume},
	}
	for _, consumer := range consumers {
		t.Run(consumer.name, func(t *testing.T) {
			got, err := consumer.consume(context.Background(), service.ContentAccessor())
			if err != nil {
				t.Fatalf("Consume: %v", err)
			}
			if got != want {
				t.Fatalf("consumer snapshot = %+v, want %+v", got, want)
			}
		})
	}
}

type ph09DocumentConsumer struct{}

func (ph09DocumentConsumer) Consume(ctx context.Context, accessor DocumentContentAccessor) (DocumentSnapshot, error) {
	snapshot, err := accessor.SnapshotActive(ctx)
	if err != nil {
		return DocumentSnapshot{}, err
	}
	_ = snapshot.DocumentID
	_ = snapshot.Path
	_ = snapshot.Content
	_ = snapshot.Selection
	_ = snapshot.Revision
	return snapshot, nil
}

type ph12DocumentConsumer struct{}

func (ph12DocumentConsumer) Consume(ctx context.Context, accessor DocumentContentAccessor) (DocumentSnapshot, error) {
	snapshot, err := accessor.SnapshotActive(ctx)
	if err != nil {
		return DocumentSnapshot{}, err
	}
	_ = snapshot.DocumentID
	_ = snapshot.Path
	_ = snapshot.Content
	_ = snapshot.Selection
	_ = snapshot.Revision
	return snapshot, nil
}
