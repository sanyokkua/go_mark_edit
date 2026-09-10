import { useMemo } from 'react';

import type { ProjectedActionState } from '../actions/actionRegistry';
import { useAppSelector } from '../store';

/**
 * Projects the active document in the shape `getActionAvailability` reads.
 *
 * Surfaces share this hook so capability checks remain centralized. Only the
 * active document's capability is needed for editing commands; when no document
 * is open the hook returns `undefined` and the registry keeps its static rules.
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
