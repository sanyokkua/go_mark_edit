import { markBufferSyncError } from '../../src/logic/utils/bufferSyncError';
import { flushOutgoingDocument } from '../../src/ui/widgets/outgoingFlush';
import { reportClassifiedError } from '../../src/logic/store/classifiedNotification';
import { store } from '../../src/logic/store';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';

it('refuses a tab switch without another notice when buffer delivery already failed', async () => {
    store.dispatch(resetNotifications());
    const error = markBufferSyncError({ code: 'io', title: 'Sync', message: 'Failed', retryable: true });
    const flush = jest.fn().mockRejectedValue(error);
    const refusal = await flushOutgoingDocument(flush, 'one');
    expect(refusal).toBeDefined();
    reportClassifiedError(store.dispatch, refusal, 'Switch failed');
    expect(store.getState().notifications.items).toHaveLength(0);
});
