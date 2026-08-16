import { configureStore } from '@reduxjs/toolkit';

import notificationsReducer from './notificationsSlice';
import type { ClassifiedError } from './appModelTypes';
import { reportClassifiedError } from './classifiedNotification';

function storeWithNotifications(): ReturnType<typeof configureStore> {
  return configureStore({ reducer: { notifications: notificationsReducer } });
}

function report(
  error: ClassifiedError,
  options?: Parameters<typeof reportClassifiedError>[3],
): { action: string; intent: string }[] {
  const store = storeWithNotifications();
  reportClassifiedError(
    store.dispatch as never,
    error,
    'File operation failed',
    options,
  );
  const state = store.getState() as {
    notifications: {
      items: { remediations: { action: string; intent: string }[] }[];
    };
  };
  return state.notifications.items[0].remediations.map((offer) => ({
    action: offer.action,
    intent: offer.intent,
  }));
}

/*
 * T142 gap (b). FR-FT-037: "A clipboard write failure for Copy path, or an OS
 * command failure for Reveal, MUST report one deduplicated
 * `system-command-failure` error naming only the safe basename, offering
 * `Retry`, and, for Reveal, also offering `Copy path`." Go has sent both members
 * since T125; `remediationFor` mapped at most one of them, and the member it
 * kept was decided by a preference rule rather than by the contract.
 */
// Proves: FR-FT-037 (the Reveal `system-command-failure` remediation pair only).
it('T142 offers both Retry and Copy path for a Reveal command failure', () => {
  expect(
    report(
      {
        category: 'system-command-failure',
        safeSubject: 'one.md',
        message: 'The file manager could not reveal the document.',
        remediations: ['Retry', 'Copy path'],
        documentId: 'one',
        dedupKey: 'reveal:one',
      },
      { intent: 'reveal' },
    ),
  ).toEqual([
    { action: 'retry', intent: 'reveal' },
    { action: 'copy-path', intent: 'copy-path' },
  ]);
});

/*
 * The Retry offered with a Reveal failure must re-run *Reveal*. Before T142 the
 * only intent this caller could pass was `copy-path`, so a Retry built from the
 * set would have carried the copy-path command and the two buttons would have
 * done the same thing under different labels — which is why the mapping took
 * Copy path and dropped Retry instead of rendering a lie.
 */
// Proves: FR-FT-037 (that the Reveal Retry re-runs Reveal), which is the clause
// the earlier single-member mapping could not express.
it('T142 never offers a Retry whose command belongs to a different action', () => {
  const offers = report(
    {
      category: 'system-command-failure',
      safeSubject: 'one.md',
      message: 'The path could not be copied.',
      remediations: ['Retry'],
      documentId: 'one',
      dedupKey: 'copy-path:one',
    },
    { intent: 'copy-path' },
  );
  expect(offers).toEqual([{ action: 'retry', intent: 'copy-path' }]);
});

/*
 * The detached half of the `not-found` row — "Save to recreate plus Copy path" —
 * is deliberately NOT closed by T142. `Save to recreate` has no command behind
 * it in the frontend: `App.tsx`'s `beginWrite` refuses a detached document
 * outright and only ever writes the *active* document, so a control offering it
 * would either refuse or save the wrong file. T160 owns that. Until then the
 * member must be dropped rather than rendered, which is what this pins.
 */
// Proves: the classified error contract's rule that a category's copy is
// remediated only from its own row — specifically that a member with no command
// behind it is dropped. It does NOT prove the `not-found` detached pair, which
// remains open as T160.
it('T142 drops Save to recreate rather than rendering a control with no command', () => {
  expect(
    report(
      {
        category: 'not-found',
        safeSubject: 'one.md',
        message: 'The document could not be found.',
        remediations: ['Save to recreate', 'Copy path'],
        documentId: 'one',
        dedupKey: 'reveal:one',
      },
      { intent: 'reveal' },
    ),
  ).toEqual([{ action: 'copy-path', intent: 'copy-path' }]);
});
