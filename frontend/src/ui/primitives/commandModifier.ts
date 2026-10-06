/*
 * True when Ctrl or Cmd is held. A control's own plain-key handling (Enter or Space
 * activation, typeahead) must not claim such a combination, so it reaches the window
 * shortcut listener instead (for example Ctrl/Cmd+Enter for Distraction-free reading).
 */
export function hasCommandModifier(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>): boolean {
    return event.ctrlKey || event.metaKey;
}
