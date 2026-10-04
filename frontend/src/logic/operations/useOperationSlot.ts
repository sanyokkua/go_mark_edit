import { useSyncExternalStore } from 'react';

import { getSnapshot, subscribe, type OperationSlotState } from './operationSlot';

export function useOperationSlot(): OperationSlotState {
    return useSyncExternalStore(subscribe, getSnapshot);
}
