// Package appmodel owns GoMarkEdit's authoritative document and workspace state.
//
// # Lifecycle
//
// Each open document has one DocumentRecord in the service state index. Open
// first reads and classifies a path, then reserves the identity before the
// commit step installs the record and publishes its metadata. Buffer edits,
// view changes, conflict decisions, and writes update that record. A write
// snapshot carries the content revision and expected disk version; the write
// coordinator performs disk I/O outside the model lock and the commit step
// records the resulting baseline. Close drains accepted autosave and write
// work before dispose removes the record and every resource owned by it.
//
// # Lock order
//
// service.mu guards the authoritative state, records, reservations, and
// pending layout. Commands take a snapshot, mutate state, and construct a
// patch while holding that lock. Disk, repository, timer, and bridge work is
// performed after releasing it. The publication path releases service.mu
// before taking publicationMu so event delivery is serialized without holding
// the model lock; it reacquires service.mu only to validate the publication's
// document commit identity and state revision and to apply a rollback. The
// emitter is called with service.mu released. Code adding a new path must not
// acquire publicationMu while already holding service.mu or call an external
// port while holding service.mu.
//
// # Event contract
//
// Successful state transitions use one state:patch event carrying a revisioned,
// content-free apperr.AppStatePatch. Its document metadata is a projection;
// active content is returned only in the command acknowledgement or the
// initial state query. Asynchronous autosave and layout failures use one
// state:error event carrying a cause-free, classified apperr.WireError. The
// application package owns the Wails RuntimeEmitter adapter; this package sees
// only StatePatchEmitter and AsyncErrorEmitter ports. If asynchronous delivery
// is unavailable or fails, the service logs the failure with its reason.
package appmodel
