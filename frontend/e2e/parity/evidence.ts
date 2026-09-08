export type PlannedParityComparison = Readonly<{
  readonly manifestKey: string;
  readonly repetition: number;
}>;

export type CapturedParityComparison = Readonly<{
  readonly manifestKey: string;
  readonly repetition: number;
  readonly referenceReady: boolean;
  readonly actualReady: boolean;
  readonly comparisonCompleted: boolean;
  readonly status: 'passed' | 'failed' | 'unresolved';
}>;

export type ParityComparisonAccounting = Readonly<{
  readonly manifestKey: string;
  readonly repetition: number;
  readonly planned: boolean;
  readonly attempted: boolean;
  readonly referenceReady: boolean;
  readonly actualReady: boolean;
  readonly comparisonCompleted: boolean;
  readonly passed: boolean;
  readonly failed: boolean;
  readonly unresolved: boolean;
}>;

export function accountParityComparisons(
  planned: readonly PlannedParityComparison[],
  captures: readonly CapturedParityComparison[],
): readonly ParityComparisonAccounting[] {
  const capturedByKey = new Map(
    captures.map((capture) => [
      `${capture.manifestKey}:${capture.repetition}`,
      capture,
    ]),
  );

  return planned.map((comparison) => {
    const capture = capturedByKey.get(
      `${comparison.manifestKey}:${comparison.repetition}`,
    );
    return {
      manifestKey: comparison.manifestKey,
      repetition: comparison.repetition,
      planned: true,
      attempted: capture !== undefined,
      referenceReady: capture?.referenceReady ?? false,
      actualReady: capture?.actualReady ?? false,
      comparisonCompleted: capture?.comparisonCompleted ?? false,
      passed: capture?.status === 'passed',
      failed: capture?.status === 'failed',
      unresolved: capture?.status === 'unresolved',
    };
  });
}
