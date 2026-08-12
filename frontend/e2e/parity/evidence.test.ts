import { accountParityComparisons } from './evidence';

it('accounts an unattempted, completed, and unresolved comparison separately', () => {
  expect(
    accountParityComparisons(
      [
        { manifestKey: 'case-a', repetition: 1 },
        { manifestKey: 'case-a', repetition: 2 },
        { manifestKey: 'case-b', repetition: 1 },
      ],
      [
        {
          manifestKey: 'case-a',
          repetition: 1,
          referenceReady: true,
          actualReady: true,
          comparisonCompleted: true,
          status: 'passed',
        },
        {
          manifestKey: 'case-a',
          repetition: 2,
          referenceReady: true,
          actualReady: true,
          comparisonCompleted: true,
          status: 'failed',
        },
      ],
    ),
  ).toEqual([
    {
      manifestKey: 'case-a',
      repetition: 1,
      planned: true,
      attempted: true,
      referenceReady: true,
      actualReady: true,
      comparisonCompleted: true,
      passed: true,
      failed: false,
      unresolved: false,
    },
    {
      manifestKey: 'case-a',
      repetition: 2,
      planned: true,
      attempted: true,
      referenceReady: true,
      actualReady: true,
      comparisonCompleted: true,
      passed: false,
      failed: true,
      unresolved: false,
    },
    {
      manifestKey: 'case-b',
      repetition: 1,
      planned: true,
      attempted: false,
      referenceReady: false,
      actualReady: false,
      comparisonCompleted: false,
      passed: false,
      failed: false,
      unresolved: false,
    },
  ]);
});
