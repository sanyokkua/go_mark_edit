import type { ClassifiedError } from '../../logic/store/appModelTypes';

/**
 * The dedup key every report of a failed outgoing flush carries.
 *
 * Two callers report the same failure — the shell's activation handler, which
 * the `Retry` remediation reaches directly, and the tab strip's funnel, which
 * every click and accelerator reaches. `enqueueToast` collapses reports sharing
 * a `code` and a `subject` and merges their controls rather than replacing them
 * (`logic/store/notificationsSlice.ts`), so the user sees one toast however many
 * layers noticed. Reporting from both is deliberate: whichever entry path the
 * switch came in on has to surface it, and neither can see the other.
 */
export const OUTGOING_FLUSH_DEDUP_KEY = 'activate:outgoing-flush';

/**
 * The classified refusal for a tab switch that could not be completed.
 *
 * `conflict` because that is what the condition is — `flushActiveSession`
 * rejects when the activation token it was given is no longer the active
 * session's, which is staleness, not an IO failure — and because the classified
 * error and remediation contract's `conflict` row is the one that pairs with
 * `Retry`. The retry is honourable here: re-issuing the same switch against a
 * settled session is exactly the command that failed.
 *
 * No `safeSubject` and no document id in the message. The reporting caller
 * supplies the title, and naming the outgoing document would put an internal
 * identifier in front of the user for no gain — the failure is about the switch,
 * not about a file.
 */
export function outgoingFlushRefusal(): ClassifiedError {
  return {
    category: 'conflict',
    message:
      'The switch was not made: the outgoing document changed while its editor state was being saved. Try again.',
    remediations: ['Retry'],
    dedupKey: OUTGOING_FLUSH_DEDUP_KEY,
  };
}

/**
 * Flush the outgoing document and say, in the classified vocabulary, whether it
 * worked.
 *
 * FR-FT-031 requires a tab switch to "flush and await the outgoing document's
 * newest text, caret, selection, scroll, and view state before activating the
 * incoming document", and requires failure to "leave the outgoing tab active
 * and install no incoming content". Returning a refusal rather than rejecting
 * is what makes the second half reachable: the caller turns it into an ordinary
 * `{ error }` outcome, which the existing reporting funnel already knows how to
 * show, and which cannot be discarded by a `void` at the call site the way a
 * rejected promise was.
 *
 * `undefined` means the switch may proceed — including when there is no
 * outgoing document to flush, which is not a failure.
 */
export async function flushOutgoingDocument(
  flush: ((documentId: string) => Promise<void>) | undefined,
  outgoingDocumentId: string | undefined,
): Promise<ClassifiedError | undefined> {
  if (outgoingDocumentId === undefined || flush === undefined) return undefined;
  try {
    await flush(outgoingDocumentId);
    return undefined;
  } catch {
    return outgoingFlushRefusal();
  }
}
