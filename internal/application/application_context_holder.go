// Package application contains the application's composition-root seams.
package application

import "context"

// ApplicationContextHolder stores the Wails lifecycle context for application
// services that are added by later stories. It is intentionally not Wails-bound.
type ApplicationContextHolder struct {
	ctx context.Context
}

// NewApplicationContextHolder creates the phase-one composition-root placeholder.
func NewApplicationContextHolder() *ApplicationContextHolder {
	return &ApplicationContextHolder{}
}

// SetContext records the context Wails supplies during application startup.
func (holder *ApplicationContextHolder) SetContext(ctx context.Context) {
	holder.ctx = ctx
}

// Context returns the lifecycle context captured during startup.
func (holder *ApplicationContextHolder) Context() context.Context {
	return holder.ctx
}
