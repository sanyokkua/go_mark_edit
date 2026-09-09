import { EventsEmit } from './index';
import { EVENTS } from '../../../logic/adapter/events';

it('mirrors state patches to a read-only browser-visible log', (): void => {
  EventsEmit(EVENTS.statePatch, {
    revision: 1,
    documents: { upsert: { 'mock-document': { dirty: true } } },
  });

  expect(window.__GME_STATE_PATCHES__).toEqual([
    {
      revision: 1,
      documents: { upsert: { 'mock-document': { dirty: true } } },
    },
  ]);
  expect(
    Object.getOwnPropertyDescriptor(window, '__GME_STATE_PATCHES__'),
  ).toEqual(expect.objectContaining({ set: undefined }));
  expect(Object.isFrozen(window.__GME_STATE_PATCHES__)).toBe(true);
});
