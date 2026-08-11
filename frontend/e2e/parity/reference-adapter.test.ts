import {
  adaptReferenceHtml,
  REFERENCE_ADAPTER_HASH,
  REFERENCE_ADAPTER_VERSION,
  REFERENCE_ZERO_ASSISTANT_CLASS,
  fileOnlyReferenceRecentFiles,
  fileOnlyReferenceStates,
  referenceStateCondition,
  referenceVariantRules,
  referenceVariants,
  unresolvedReferenceStateConditions,
} from './reference-adapter';

const bindingHtml =
  '<html><body><div class="app" id="app"><main>binding</main></div></body></html>';
const launcherHtml = [
  '<html><body><div class="app" id="app">',
  '<div class="launcher"><div class="lc">',
  '<div class="acts"><button>New file</button><button>Open file…</button><button>Open folder…</button></div>',
  '<div class="rec"><div class="lbl">Recent</div>',
  '<div class="r"><svg class="ic"><use href="#i-file"/></svg>release-notes.md<small>~/Notes/projects</small></div>',
  '<div class="r"><svg class="ic"><use href="#i-file"/></svg>spec-draft.md<small>~/Notes/projects</small></div>',
  '<div class="r"><svg class="ic"><use href="#i-file"/></svg>readme.md<small>~/Notes/archive</small></div>',
  '<div class="r"><svg class="ic"><use href="#i-folder"/></svg>Notes<small>~/</small></div>',
  '</div></div></div></div>',
  '</body></html>',
].join('');

it('reference adapter hash is stable and bounded', () => {
  const first = adaptReferenceHtml(bindingHtml, 'file-only');
  const second = adaptReferenceHtml(bindingHtml, 'file-only');

  expect(first.adapterHash).toBe(REFERENCE_ADAPTER_HASH);
  expect(first.adapterHash).toBe(second.adapterHash);
  expect(first.sourceHash).toBe(second.sourceHash);
  expect(first.html).toContain(`data-reference-variant="file-only"`);
  expect(first.html).toContain(`class="app ${REFERENCE_ZERO_ASSISTANT_CLASS}"`);
  expect(first.html).not.toContain('iframe');
  expect(first.rules.excludedRegions).toEqual([
    'workspace',
    'assistant',
    'rich-rendering',
  ]);
  expect(REFERENCE_ADAPTER_VERSION).toBe('feature-003-reference-adapter-v2');
});

it('reference adapter exposes only the reviewed variant boundary', () => {
  expect(referenceVariants).toEqual([
    'base',
    'file-only',
    'file-menu',
    'conflict',
    'move-tab',
  ]);
  expect(referenceVariantRules('move-tab').allowedRegions).toEqual([
    'tab-menu',
    'tabs',
  ]);
  expect(() => adaptReferenceHtml(bindingHtml, 'workspace' as never)).toThrow(
    'Unsupported reference variant',
  );
});

it('documents normalization as unresolved instead of reusing the save prompt', () => {
  expect(referenceStateCondition('prompt-normalization')).toEqual({
    status: 'unresolved',
    reason:
      'The immutable binding mockup has no source-backed Normalize line endings? condition.',
  });
  expect(unresolvedReferenceStateConditions).toHaveProperty(
    'prompt-normalization',
  );
  expect(referenceStateCondition('resync-recovery')).toEqual({
    status: 'supported',
  });
});

it('adapts the file-only launcher from source-backed file rows and unavailable Open Folder', () => {
  expect(fileOnlyReferenceStates).toEqual(['empty', 'first-run', 'six-file']);

  const empty = adaptReferenceHtml(launcherHtml, 'file-only', 'first-run');
  expect(empty.html.match(/class="r"/gu)).toHaveLength(1);
  expect(empty.html).toContain('data-no-recent-files="true"');
  expect(empty.html).toContain(
    'disabled aria-disabled="true" data-availability="deferred"',
  );
  expect(empty.fileOnlyState).toBe('first-run');

  const six = adaptReferenceHtml(launcherHtml, 'file-only', 'six-file');
  expect(six.html.match(/class="r"/gu)).toHaveLength(6);
  expect(six.html).not.toContain('#i-folder');
  expect(
    [...six.html.matchAll(/>(parity-recent-\d{2}\.md)<small>/gu)].map(
      ([, name]) => name,
    ),
  ).toEqual(fileOnlyReferenceRecentFiles.map(([name]) => name));
});

it('rejects a file-only state on a non-file-only reference variant', () => {
  expect(() =>
    adaptReferenceHtml(bindingHtml, 'base', 'empty'),
  ).toThrow('requires the file-only variant');
});
