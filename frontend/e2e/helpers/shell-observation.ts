import { expect, type Page, type Request } from '@playwright/test';

export type ShellTimingSample = {
  visibleUpdateMs: number;
  freezeMs: number;
  acknowledgedMs: number;
};

export type ShellRequestObservation = {
  method: string;
  url: string;
  local: boolean;
  resourceType: string;
};

export function observeShellRequests(
  page: Page,
  localOrigin: string,
): ShellRequestObservation[] {
  const observations: ShellRequestObservation[] = [];
  page.on('request', (request: Request) => {
    const url = request.url();
    observations.push({
      method: request.method(),
      url,
      local: new URL(url).origin === localOrigin,
      resourceType: request.resourceType(),
    });
  });
  return observations;
}

export function assertLocalRequests(
  observations: ShellRequestObservation[],
): void {
  expect(observations.filter((observation) => !observation.local)).toEqual([]);
}

export function assertShellTiming(samples: ShellTimingSample[]): void {
  expect(samples.length).toBeGreaterThanOrEqual(20);
  const withinTarget = samples.filter(
    (sample) => sample.visibleUpdateMs <= 100,
  ).length;
  expect(withinTarget / samples.length).toBeGreaterThanOrEqual(0.95);
  expect(samples.every((sample) => sample.freezeMs <= 250)).toBe(true);
  expect(samples.every((sample) => sample.acknowledgedMs <= 500)).toBe(true);
}
