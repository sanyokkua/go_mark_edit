import {
  createSemanticSignature,
  readSemanticDomSnapshot,
  SemanticPairingMismatchError,
  assertSemanticPairing,
  type SemanticCaptureContext,
} from './state-contract';
import {
  TARGETED_MANIFEST,
  assertTargetedManifestIntegrity,
} from '../targeted-manifest';
import { LOGICAL_CASE_COUNT, PARITY_MANIFEST } from './manifest';

const context: SemanticCaptureContext = {
  referenceVariant: 'base',
  referenceSourceHash: 'source-hash',
  family: 'editor-split',
  activeScreen: 'editor-split',
  implementedActionIds: ['file', 'settings', 'view', 'about'],
};

function referenceMarkup(): void {
  document.documentElement.dataset.theme = 'minimal';
  document.documentElement.dataset.mode = 'light';
  document.body.dataset.theme = 'minimal';
  document.body.dataset.mode = 'light';
  document.body.innerHTML = `
    <div class="app no-assistant" id="app">
      <div class="titlebar">
        <div class="menu">
          <button data-menu="file">File</button>
          <button data-menu="settings">Settings</button>
          <button data-menu="view">View</button>
          <button data-menu="about">About</button>
        </div>
        <div class="doc-name">Notes / release-notes.md · autosaved</div>
      </div>
      <div class="tabs">
        <div class="tab active dirty">release-notes.md</div>
        <div class="tab">spec-draft.md</div>
      </div>
      <div class="statusbar">UTF-8 · LF · Autosaved</div>
    </div>
  `;
  window.history.replaceState({}, '', '/#minimal-light/editor-split');
}

function signatureFromReferenceMarkup() {
  const snapshot = readSemanticDomSnapshot({
    pageKind: 'reference',
    implementedActionIds: context.implementedActionIds,
    viewport: { width: 1280, height: 720 },
  });
  return createSemanticSignature(snapshot, context);
}

it('T056 records every required semantic pairing field', () => {
  referenceMarkup();

  const signature = signatureFromReferenceMarkup();

  expect(signature).toMatchObject({
    referenceVariant: 'base',
    referenceSourceHash: 'source-hash',
    theme: 'minimal',
    mode: 'light',
    viewport: { width: 1280, height: 720 },
    family: 'editor-split',
    activeScreen: 'editor-split',
    visibleMenuDialog: [],
    implementedActions: {
      file: 'enabled',
      settings: 'enabled',
      view: 'enabled',
      about: 'enabled',
    },
    launcher: {
      recentCount: 0,
      recentLabels: [],
      openFolder: 'absent',
    },
    activeTabs: [
      { label: 'release-notes.md', active: true, dirty: true },
      { label: 'spec-draft.md', active: false, dirty: false },
    ],
    documentIdentity: { name: 'release-notes.md', status: 'Autosaved' },
    statusDetail: {
      saveState: 'Autosaved',
      encoding: 'UTF-8',
      lineEnding: 'LF',
      visible: true,
    },
  });
});

it('T056 extracts actual action and modal availability as semantic state', () => {
  referenceMarkup();
  document.body.innerHTML = `
    <nav aria-label="Application actions">
      <button>File</button>
      <button disabled>Settings</button>
      <button>View</button>
      <button>About</button>
    </nav>
    <div data-testid="document-launcher">
      <button>New file</button>
      <button>Open file…</button>
      <button disabled>Open folder…</button>
      <div aria-label="Recent"><ul><li><button title="one.md">one.md</button></li></ul></div>
    </div>
    <div role="dialog" aria-label="Save changes before closing?">prompt</div>
  `;

  const snapshot = readSemanticDomSnapshot({
    pageKind: 'actual',
    implementedActionIds: context.implementedActionIds,
    viewport: { width: 1280, height: 720 },
  });

  expect(snapshot.visibleMenuDialog).toEqual(['Save changes before closing?']);
  expect(snapshot.implementedActions).toEqual({
    file: 'enabled',
    settings: 'disabled',
    view: 'enabled',
    about: 'enabled',
  });
  expect(snapshot.launcher).toEqual({
    recentCount: 1,
    recentLabels: ['one.md'],
    openFolder: 'disabled',
  });
});

it('T056 fails closed on a semantic pairing mismatch before image comparison', () => {
  const reference = signatureFromReferenceMarkup();
  const actual = {
    ...reference,
    activeScreen: 'editor-only',
  };

  expect(() => assertSemanticPairing(reference, actual)).toThrow(
    SemanticPairingMismatchError,
  );
  try {
    assertSemanticPairing(reference, actual);
  } catch (error) {
    expect(error).toMatchObject({
      code: 'state-pairing-mismatch',
      differences: [
        'activeScreen: reference="editor-split" actual="editor-only"',
      ],
    });
  }
});

it('T056 keeps the focused manifest separate from the unrestricted accounting', () => {
  expect(() => assertTargetedManifestIntegrity()).not.toThrow();
  expect(TARGETED_MANIFEST).toHaveLength(1);
  expect(TARGETED_MANIFEST[0]).toMatchObject({
    key: 'targeted:closed-menubar:1280:minimal-light',
    family: 'editor-split',
    width: 1280,
    palette: { id: 'minimal-light', theme: 'minimal', mode: 'light' },
  });
  expect(PARITY_MANIFEST).toHaveLength(LOGICAL_CASE_COUNT);
  expect(
    PARITY_MANIFEST.some(
      ({ key }) => key === 'targeted:closed-menubar:1280:minimal-light',
    ),
  ).toBe(false);
});
