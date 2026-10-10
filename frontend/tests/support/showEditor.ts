import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { documentFixture } from './appFixtures';

/** Projects one writable active document whose editor is shown, so editor formatting is available. */
export function showEditor(documentId = 'shown-doc'): void {
    store.dispatch(resetProjection());
    store.dispatch(
        hydrateProjection({
            revision: 1,
            documents: { [documentId]: documentFixture(documentId) },
            activeDocumentId: documentId,
            ui: {},
        }),
    );
}
