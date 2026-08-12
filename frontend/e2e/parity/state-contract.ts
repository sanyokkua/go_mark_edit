import type { Page } from '@playwright/test';

export const SEMANTIC_CONTRACT_VERSION = 'feature-003-state-contract-v1';

export type SemanticAvailability = 'enabled' | 'disabled' | 'absent';

export type SemanticViewport = Readonly<{
  readonly width: number;
  readonly height: number;
}>;

export type SemanticTab = Readonly<{
  readonly label: string;
  readonly active: boolean;
  readonly dirty: boolean;
}>;

export type SemanticLauncher = Readonly<{
  readonly recentCount: number;
  readonly recentLabels: readonly string[];
  readonly openFolder: SemanticAvailability;
}>;

export type SemanticDocumentIdentity = Readonly<{
  readonly name: string;
  readonly status: string;
}>;

export type SemanticStatusDetail = Readonly<{
  readonly visible: boolean;
  readonly saveState: string;
  readonly encoding: string;
  readonly lineEnding: string;
  readonly arrangement: string;
}>;

export type SemanticSignature = Readonly<{
  readonly contractVersion: typeof SEMANTIC_CONTRACT_VERSION;
  readonly referenceVariant: string;
  readonly referenceSourceHash: string;
  readonly theme: string;
  readonly mode: string;
  readonly viewport: SemanticViewport;
  readonly family: string;
  readonly activeScreen: string;
  readonly visibleMenuDialog: readonly string[];
  readonly implementedActions: Readonly<Record<string, SemanticAvailability>>;
  readonly launcher: SemanticLauncher;
  readonly activeTabs: readonly SemanticTab[];
  readonly documentIdentity: SemanticDocumentIdentity | null;
  readonly statusDetail: SemanticStatusDetail | null;
}>;

export type SemanticCaptureContext = Readonly<{
  readonly referenceVariant: string;
  readonly referenceSourceHash: string;
  readonly family: string;
  readonly activeScreen: string;
  readonly implementedActionIds: readonly string[];
}>;

export type SemanticPageKind = 'reference' | 'actual';

export type SemanticDomReadInput = Readonly<{
  readonly pageKind: SemanticPageKind;
  readonly implementedActionIds: readonly string[];
  readonly viewport?: SemanticViewport;
}>;

export type SemanticDomSnapshot = Readonly<{
  readonly theme: string;
  readonly mode: string;
  readonly viewport: SemanticViewport;
  readonly activeScreen: string;
  readonly visibleMenuDialog: readonly string[];
  readonly implementedActions: Readonly<Record<string, SemanticAvailability>>;
  readonly launcher: SemanticLauncher;
  readonly activeTabs: readonly SemanticTab[];
  readonly documentIdentity: SemanticDocumentIdentity | null;
  readonly statusDetail: SemanticStatusDetail | null;
}>;

/**
 * This function is intentionally self-contained because Playwright serializes
 * it into the page before evaluating it. It observes only semantic state and
 * never mutates either the reference or application DOM.
 */
export function readSemanticDomSnapshot(
  input: SemanticDomReadInput,
): SemanticDomSnapshot {
  const normalized = (value: string | null | undefined): string =>
    (value ?? '')
      .replace(/[\u2066-\u2069]/gu, '')
      .replace(/\s+/gu, ' ')
      .trim();
  const isVisible = (element: Element | null): boolean => {
    if (element === null) return false;
    const htmlElement = element as HTMLElement;
    if (
      htmlElement.hidden ||
      htmlElement.getAttribute('aria-hidden') === 'true'
    ) {
      return false;
    }
    const style = window.getComputedStyle(htmlElement);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const availability = (element: Element | null): SemanticAvailability => {
    if (element === null) return 'absent';
    const htmlElement = element as HTMLButtonElement;
    return htmlElement.disabled ||
      htmlElement.getAttribute('aria-disabled') === 'true'
      ? 'disabled'
      : 'enabled';
  };
  const statusFromText = (value: string): string => {
    if (/read[- ]only/iu.test(value)) return 'Read-only';
    if (/unsaved changes/iu.test(value)) return 'Unsaved changes';
    if (/autosaved/iu.test(value)) return 'Autosaved';
    if (/(^|\s)saved(?:\s|$)/iu.test(value)) return 'Saved';
    if (/not saved/iu.test(value)) return 'Not saved';
    return '';
  };
  const metadataFromText = (
    value: string,
  ): {
    readonly encoding: string;
    readonly lineEnding: string;
  } => ({
    encoding: /UTF-16/iu.test(value)
      ? 'UTF-16'
      : /UTF-8/iu.test(value)
        ? 'UTF-8'
        : '',
    lineEnding: /CRLF/iu.test(value)
      ? 'CRLF'
      : /mixed/iu.test(value)
        ? 'Mixed'
        : /\bLF\b/iu.test(value)
          ? 'LF'
          : '',
  });
  const activeScreen = (): string => {
    if (input.pageKind === 'reference') {
      const hash = window.location.hash.replace(/^#/u, '');
      return hash.split('/').at(-1) || 'unknown';
    }
    const launcher = document.querySelector(
      '[data-testid="document-launcher"]',
    );
    if (isVisible(launcher)) return 'empty';
    const parityFamily = document
      .querySelector('[data-parity-family]')
      ?.getAttribute('data-parity-family');
    if (parityFamily !== null && parityFamily !== undefined) {
      return parityFamily;
    }
    const editor = document.querySelector('[aria-label="Editor pane"]');
    const preview = document.querySelector('[aria-label="Preview pane"]');
    const editorVisible = isVisible(editor);
    const previewVisible = isVisible(preview);
    const parityCase = new URLSearchParams(window.location.search).get('parity-case');
    if (parityCase?.startsWith('state:preview-paused:')) {
      return 'paused-preview';
    }
    if (editorVisible && previewVisible) return 'editor-split';
    if (editorVisible) return 'editor-only';
    if (previewVisible) return 'preview-only';
    return 'unknown';
  };
  const visibleMenuDialog = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="menu"], [role="dialog"], [data-viewport-popup], .dropdown.show, .modal.show',
    ),
  )
    .filter(isVisible)
    .map((element) =>
      normalized(
        element.getAttribute('aria-label') ??
          element.getAttribute('data-viewport-popup') ??
          element.id ??
          element.getAttribute('role'),
      ),
    )
    .filter(
      (label, index, labels) =>
        label.length > 0 && labels.indexOf(label) === index,
    );
  const implementedActions = Object.fromEntries(
    input.implementedActionIds.map((actionId) => {
      const referenceElement = Array.from(
        document.querySelectorAll<HTMLElement>('[data-menu]'),
      ).find((element) => element.getAttribute('data-menu') === actionId);
      const actualElement = Array.from(
        document.querySelectorAll<HTMLElement>('nav button'),
      ).find(
        (element) =>
          normalized(
            element.getAttribute('aria-label') ?? element.textContent,
          ).toLowerCase() === actionId.toLowerCase(),
      );
      return [
        actionId,
        availability(
          input.pageKind === 'reference'
            ? (referenceElement ?? null)
            : (actualElement ?? null),
        ),
      ];
    }),
  ) as Record<string, SemanticAvailability>;
  const launcher =
    input.pageKind === 'reference'
      ? document.querySelector<HTMLElement>('.launcher')
      : document.querySelector<HTMLElement>(
          '[data-testid="document-launcher"]',
        );
  const launcherVisible = isVisible(launcher);
  const recentElements = launcherVisible
    ? input.pageKind === 'reference'
      ? Array.from(launcher?.querySelectorAll<HTMLElement>('.rec .r') ?? [])
      : Array.from(launcher?.querySelectorAll<HTMLElement>('li') ?? [])
    : [];
  const openFolderElement = launcherVisible
    ? Array.from(launcher?.querySelectorAll<HTMLElement>('button') ?? []).find(
        (element) => /open folder/iu.test(normalized(element.textContent)),
      )
    : undefined;
  const launcherState: SemanticLauncher = {
    recentCount: recentElements.length,
    recentLabels: recentElements.map((element) =>
      normalized(element.textContent),
    ),
    openFolder: availability(openFolderElement ?? null),
  };
  const tabElements =
    input.pageKind === 'reference'
      ? Array.from(document.querySelectorAll<HTMLElement>('.tabs .tab')).filter(
          isVisible,
        )
      : Array.from(
          document.querySelectorAll<HTMLElement>('[role="tab"]'),
        ).filter(isVisible);
  const activeTabs = tabElements.map((element) => {
    const label = normalized(
      input.pageKind === 'reference'
        ? element.textContent?.replace(/×/gu, '')
        : (element.getAttribute('aria-label') ?? element.textContent),
    );
    const dirty =
      input.pageKind === 'reference'
        ? element.classList.contains('dirty')
        : element.querySelector('[aria-label*="Modified"]') !== null;
    return {
      label,
      active:
        input.pageKind === 'reference'
          ? element.classList.contains('active')
          : element.getAttribute('aria-selected') === 'true',
      dirty,
    };
  });
  const identityElement =
    input.pageKind === 'reference'
      ? document.querySelector<HTMLElement>('.doc-name')
      : document.querySelector<HTMLElement>(
          'header[aria-label="Document identity"]',
        );
  const identityText = normalized(identityElement?.textContent);
  const identityStatus = statusFromText(identityText);
  const documentIdentity =
    activeTabs.length === 0 && identityElement === null
      ? null
      : {
          name:
            activeTabs.find((tab) => tab.active)?.label ??
            normalized(identityElement?.querySelector('h1')?.textContent),
          status: identityStatus,
        };
  const statusElement =
    input.pageKind === 'reference'
      ? document.querySelector<HTMLElement>('.statusbar')
      : document.querySelector<HTMLElement>(
          '[role="status"][aria-label="Document status"]',
        );
  const statusText = normalized(statusElement?.textContent);
  const encodingText = normalized(
    statusElement?.querySelector<HTMLElement>(
      input.pageKind === 'reference'
        ? '.sb-enc'
        : '[data-status-item="encoding"]',
    )?.textContent,
  );
  const lineEndingText = normalized(
    statusElement?.querySelector<HTMLElement>(
      input.pageKind === 'reference'
        ? '.sb-eol'
        : '[data-status-item="line-ending"]',
    )?.textContent,
  );
  const metadata = metadataFromText(statusText);
  const editorVisible = isVisible(
    document.querySelector(
      input.pageKind === 'reference'
        ? '#pane-editor'
        : '[aria-label="Editor pane"]',
    ),
  );
  const previewVisible = isVisible(
    document.querySelector(
      input.pageKind === 'reference'
        ? '#pane-preview'
        : '[aria-label="Preview pane"]',
    ),
  );
  const statusDetail =
    statusElement === null || !isVisible(statusElement)
      ? null
      : {
          visible: true,
          saveState: statusFromText(statusText) || identityStatus,
          encoding:
            metadataFromText(encodingText).encoding || metadata.encoding,
          lineEnding:
            metadataFromText(lineEndingText).lineEnding || metadata.lineEnding,
          arrangement:
            editorVisible && previewVisible
              ? 'split'
              : editorVisible
                ? 'editor'
                : previewVisible
                  ? 'preview'
                  : 'unknown',
        };
  const root = document.documentElement;
  const body = document.body;
  return {
    theme: root.dataset.theme ?? body.dataset.theme ?? '',
    mode: root.dataset.mode ?? body.dataset.mode ?? '',
    viewport: input.viewport ?? {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    activeScreen: activeScreen(),
    visibleMenuDialog,
    implementedActions,
    launcher: launcherState,
    activeTabs,
    documentIdentity,
    statusDetail,
  };
}

export function createSemanticSignature(
  snapshot: SemanticDomSnapshot,
  context: SemanticCaptureContext,
): SemanticSignature {
  return {
    contractVersion: SEMANTIC_CONTRACT_VERSION,
    referenceVariant: context.referenceVariant,
    referenceSourceHash: context.referenceSourceHash,
    theme: snapshot.theme,
    mode: snapshot.mode,
    viewport: { ...snapshot.viewport },
    family: context.family,
    activeScreen: snapshot.activeScreen,
    visibleMenuDialog: [...snapshot.visibleMenuDialog],
    implementedActions: { ...snapshot.implementedActions },
    launcher: {
      recentCount: snapshot.launcher.recentCount,
      recentLabels: [...snapshot.launcher.recentLabels],
      openFolder: snapshot.launcher.openFolder,
    },
    activeTabs: snapshot.activeTabs.map((tab) => ({ ...tab })),
    documentIdentity:
      snapshot.documentIdentity === null
        ? null
        : { ...snapshot.documentIdentity },
    statusDetail:
      snapshot.statusDetail === null ? null : { ...snapshot.statusDetail },
  };
}

export async function captureSemanticSignature(
  page: Page,
  context: SemanticCaptureContext,
  pageKind: SemanticPageKind,
): Promise<SemanticSignature> {
  const snapshot = await page.evaluate(readSemanticDomSnapshot, {
    pageKind,
    implementedActionIds: context.implementedActionIds,
  });
  return createSemanticSignature(snapshot, context);
}

function valueForDifference(value: unknown): string {
  return JSON.stringify(value);
}

export class SemanticPairingMismatchError extends Error {
  readonly code = 'state-pairing-mismatch';
  readonly differences: readonly string[];

  constructor(differences: readonly string[]) {
    super(`Semantic state pairing mismatch:\n${differences.join('\n')}`);
    this.name = 'SemanticPairingMismatchError';
    this.differences = differences;
  }
}

export function semanticPairingDifferences(
  reference: SemanticSignature,
  actual: SemanticSignature,
): readonly string[] {
  const fields: readonly (keyof SemanticSignature)[] = [
    'contractVersion',
    'referenceVariant',
    'referenceSourceHash',
    'theme',
    'mode',
    'viewport',
    'family',
    'activeScreen',
    'visibleMenuDialog',
    'implementedActions',
    'launcher',
    'activeTabs',
    'documentIdentity',
    'statusDetail',
  ];
  return fields
    .filter(
      (field) =>
        JSON.stringify(reference[field]) !== JSON.stringify(actual[field]),
    )
    .map(
      (field) =>
        `${String(field)}: reference=${valueForDifference(reference[field])} actual=${valueForDifference(actual[field])}`,
    );
}

export function assertSemanticPairing(
  reference: SemanticSignature,
  actual: SemanticSignature,
): void {
  const differences = semanticPairingDifferences(reference, actual);
  if (differences.length > 0) {
    throw new SemanticPairingMismatchError(differences);
  }
}
