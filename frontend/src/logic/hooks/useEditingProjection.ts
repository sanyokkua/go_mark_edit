import { useMemo } from 'react';

import type { ProjectedActionState } from '../actions/actionRegistry';
import { useAppSelector } from '../store';

/**
 * The active document in the shape `getActionAvailability` reads.
 *
 * Every surface that offers an editing command has to be able to *ask* the
 * registry whether that command is available, and the registry answers from a
 * projection: `projectedStateFor` reads `context.projectedState ?? context.projection`
 * and has no store fallback, so a surface that supplies neither gets no
 * document and therefore no capability rule. That is how FR-FT-006's "Editing
 * … MUST be unavailable" stayed unmet at the toolbar and the editor context
 * menu after the registry itself had been fixed — both computed `disabled` from
 * the static `entry.availability.kind` and passed nothing to `dispatchAction`.
 *
 * One hook rather than a copy per surface, because a second projection that has
 * to be kept in step by hand is the `SettingsMenu` defect AGENTS.md records:
 * the duplicate is right until the registry changes and nobody remembers it
 * exists. T178.
 *
 * Only the active document is projected, and only its `capability`, because the
 * editing rule is the only one these surfaces need the registry to resolve.
 * Returns `undefined` when no document is open, which leaves every caller's
 * pre-existing static behaviour untouched.
 */
export function useEditingProjection(
  documentId: string | undefined,
): ProjectedActionState | undefined {
  const capability = useAppSelector((state) =>
    documentId === undefined
      ? undefined
      : state.documents.byId[documentId]?.capability,
  );
  return useMemo(
    () =>
      documentId === undefined
        ? undefined
        : {
            activeDocumentId: documentId,
            documents: { [documentId]: { capability } },
          },
    [capability, documentId],
  );
}
