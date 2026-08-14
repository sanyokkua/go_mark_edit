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
  readonly viewport?: SemanticViewport;
}>;

export type SemanticPageKind = 'reference' | 'actual';

/**
 * The reference↔production selector mapping for the binding's status row.
 *
 * The binding draws each status item as one `.statusbar .b` span identified by
 * its own class (`mockup.html:838-841`); production draws each as one
 * `[data-status-item]` span (`frontend/src/ui/components/StatusBar.tsx:49-70`).
 * Only `.sb-enc` and `.sb-eol` were ever paired, and only inside the serialized
 * snapshot reader below — nothing declared the pairing for `.sb-count`, so the
 * two status conditions the binding can actually express
 * (`.sb-eol` → `status-mixed-ending`, `.sb-count` → `status-large-file`,
 * spec.md Session 2026-08-14) had no mapped production counterpart to compare
 * against. This table is that declaration, and `targeted-manifest.ts` asserts
 * that the compared status regions are built from it rather than from selectors
 * invented at the call site.
 *
 * `readSemanticDomSnapshot` keeps its own inline copies of the two selectors it
 * needs because Playwright serializes that function into the page, where module
 * scope does not exist; `assertStatusItemSelectorContract` below checks the two
 * copies still agree with this table.
 */
export const STATUS_ITEM_SELECTORS = Object.freeze({
  count: Object.freeze({
    reference: '.sb-count',
    actual: '[data-status-item="count"]',
  }),
  encoding: Object.freeze({
    reference: '.sb-enc',
    actual: '[data-status-item="encoding"]',
  }),
  'line-ending': Object.freeze({
    reference: '.sb-eol',
    actual: '[data-status-item="line-ending"]',
  }),
});

export type StatusItemId = keyof typeof STATUS_ITEM_SELECTORS;

export function statusItemSelector(
  item: StatusItemId,
  pageKind: SemanticPageKind,
): string {
  return STATUS_ITEM_SELECTORS[item][pageKind];
}

/**
 * The native minimum window is 375x480 (`main.go:104-105`), and frame rounding
 * can expose a 376px CSS viewport at that size — the same bound production
 * spells as `MINIMUM_WINDOW_MAX_WIDTH` in
 * `frontend/src/ui/widgets/minimumWindow.ts:10`.
 */
export const MINIMUM_WINDOW_MAX_WIDTH = 376;

export type SemanticDomReadInput = Readonly<{
  readonly pageKind: SemanticPageKind;
  readonly implementedActionIds: readonly string[];
  readonly viewport?: SemanticViewport;
  /**
   * The reviewed screen this capture is of, from the manifest entry.
   *
   * The reference reports its screen by name — the harness owns one — while the
   * application has no screen concept, so the reader infers one from which
   * panes are drawn. At the minimum window that inference has a hole: T078
   * collapses Split to a single editor pane while the stored arrangement stays
   * split, so "editor drawn, preview not" is true of `editor-split` and
   * `editor-only` alike and the reader cannot tell them apart from the DOM.
   *
   * Supplying the declared screen resolves that one ambiguity and nothing else:
   * it is honoured only below `MINIMUM_WINDOW_MAX_WIDTH`, only when exactly one
   * pane is drawn, and only when the drawn pane is the one the declared screen
   * requires. A capture that draws the wrong pane still reports the inferred
   * screen and still fails the pairing.
   */
  readonly declaredScreen?: string;
  /**
   * The minimum-window bound, carried in because Playwright serializes the
   * reader into the page where module scope does not exist. A caller that
   * declares no bound gets no minimum-window resolution at all: the comparison
   * below reads `0`, so no viewport ever qualifies and the plain pane inference
   * stands.
   */
  readonly minimumWindowMaxWidth?: number;
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
    const parityCase = new URLSearchParams(window.location.search).get(
      'parity-case',
    );
    if (parityCase?.startsWith('state:preview-paused:')) {
      return 'paused-preview';
    }
    const popupScreens = [
      ['file-menu', 'menu-file'],
      ['settings-menu', 'menu-settings'],
      ['view-menu', 'menu-view'],
      ['about-menu', 'menu-about'],
    ] as const;
    for (const [popup, screen] of popupScreens) {
      if (
        isVisible(document.querySelector(`[data-viewport-popup="${popup}"]`))
      ) {
        return screen;
      }
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
    if (editorVisible && previewVisible) return 'editor-split';
    /*
     * T078: at the minimum window Split draws the editor alone, so one drawn
     * pane no longer identifies the screen. Resolve that one ambiguity with the
     * declared screen — and only when the pane actually drawn is the one that
     * screen requires, so a capture showing the wrong pane still fails.
     */
    const minimumWindow =
      window.innerWidth <= (input.minimumWindowMaxWidth ?? 0);
    const declared = input.declaredScreen;
    if (minimumWindow && editorVisible && !previewVisible) {
      if (declared === 'editor-split' || declared === 'editor-only') {
        return declared;
      }
    }
    if (minimumWindow && previewVisible && !editorVisible) {
      if (declared === 'preview-only') return declared;
    }
    if (editorVisible) return 'editor-only';
    if (previewVisible) return 'preview-only';
    return 'unknown';
  };
  const visibleMenuDialog = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="menu"], [role="dialog"], [data-viewport-popup], .dropdown.show, .modal.show, .ovf-menu',
    ),
  )
    .filter(isVisible)
    .map((element) => {
      const label =
        [
          element.getAttribute('data-viewport-popup'),
          element.getAttribute('aria-label'),
          element.id,
          element.getAttribute('role'),
          element.classList.contains('ovf-menu') ? 'shell-overflow' : null,
        ]
          .map(normalized)
          .find((value) => value.length > 0) ?? '';
      if (input.pageKind === 'reference' && /^m-[a-z-]+$/u.test(label)) {
        return `${label.slice(2)}-menu`;
      }
      if (label === 'editor-overflow' || label === 'shell-overflow') {
        return 'toolbar-overflow';
      }
      return label;
    })
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
        document.querySelectorAll<HTMLElement>(
          'nav button, [data-viewport-popup="shell-overflow"] [role="menuitem"], [data-application-overflow-action]',
        ),
      ).find(
        (element) =>
          normalized(
            element.getAttribute('data-application-overflow-action') ??
              element.getAttribute('aria-label') ??
              element.textContent,
          ).toLowerCase() === actionId.toLowerCase() ||
          normalized(element.textContent).toLowerCase() ===
            actionId.toLowerCase(),
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

/**
 * The status items `readSemanticDomSnapshot` pairs with its own inline copies of
 * the selectors. Playwright serializes that function into the page, so it cannot
 * read `STATUS_ITEM_SELECTORS` from module scope — this keeps the copies honest
 * instead of letting the table and the reader drift apart silently.
 */
const READER_PAIRED_STATUS_ITEMS: readonly StatusItemId[] = [
  'encoding',
  'line-ending',
];

export function assertStatusItemSelectorContract(): void {
  const source = String(readSemanticDomSnapshot);
  for (const item of READER_PAIRED_STATUS_ITEMS) {
    for (const pageKind of ['reference', 'actual'] as const) {
      const selector = statusItemSelector(item, pageKind);
      if (!source.includes(selector)) {
        throw new Error(
          `status item ${item} lost its ${pageKind} selector ${selector} in readSemanticDomSnapshot`,
        );
      }
    }
  }
}

assertStatusItemSelectorContract();

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
    viewport: context.viewport,
    declaredScreen: context.activeScreen,
    minimumWindowMaxWidth: MINIMUM_WINDOW_MAX_WIDTH,
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
