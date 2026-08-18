import { createHash } from 'node:crypto';

/*
 * Bumped to v3 by T127, which folded the four File-menu accelerators the T059
 * decision used to leave as literal mockup text into the same host-formatted
 * treatment every other accelerator already gets. That retires the reviewed
 * macOS accelerator-glyph pixel exception, so an adaptation produced by v2 is
 * not interchangeable with one produced by v3.
 *
 * Bumped to v4 by T173. IN_SCOPE_PREVIEW_CONTENT claimed to carry "the same
 * in-scope basic-preview content the application renders for the parity
 * document", and it did not: it carried a *spell-corrected* paragraph, and the
 * application only produced that because PreviewPane rewrote the document's
 * text in its render path whenever `?parity-case` was present. Seven
 * replaceAll() calls, on the production path, correcting the fixture's
 * deliberate misspellings before rendering.
 *
 * Those misspellings are load-bearing on the reference side — the mockup shows
 * a lint squiggle under "exited" — so the fixture is right and the correction
 * was the invention. FR-FT-054 lets the route seed a fixture; it does not let a
 * production component render different content on it. The rewrite is deleted
 * and this constant now carries what the application actually renders, so an
 * adaptation produced by v3 is not interchangeable with one produced by v4.
 */
export const REFERENCE_ADAPTER_VERSION = 'feature-003-reference-adapter-v4';

export const REFERENCE_ZERO_ASSISTANT_CLASS = 'no-assistant';

export const referenceVariants = [
  'base',
  'file-only',
  'file-menu',
  'conflict',
  'move-tab',
  'status-mixed-ending',
  'status-large-file',
  'editor-split-375',
] as const;

export type ReferenceVariant = (typeof referenceVariants)[number];

/**
 * Session 2026-08-14 clarification, superseding the 2026-08-13 six-variant
 * answer. The immutable binding's status row (`mockup.html:837-845`) carries
 * exactly one condition, and it draws no save status at all — the binding puts
 * that in the title bar (`.doc-name … · autosaved`, `mockup.html:594`). Of the
 * six `status-*` manifest state IDs, only two name something the binding's own
 * status row expresses:
 *
 *   - `status-mixed-ending` — the line ending, drawn by `.sb-eol` (`LF`)
 *   - `status-large-file`   — the document size, drawn by `.sb-count`
 *     (`231 words`)
 *
 * Those two get a reference variant here. The remaining four
 * (`status-saved`, `status-autosaved`, `status-unsaved-changes`,
 * `status-read-only`) differ only in a save status the binding never draws, so
 * they are behaviour-verified against `data-status-state` and the title bar in
 * `targeted-parity.test.ts` instead of being given a fabricated picture.
 */
export const statusReferenceStates = ['mixed-ending', 'large-file'] as const;

export type StatusReferenceState = (typeof statusReferenceStates)[number];

/**
 * Each status variant rewrites exactly one of the binding's own status spans to
 * the text production renders for that state, and nothing else. `sourceText` is
 * the immutable source's own value, so a source that stops carrying it fails
 * loudly instead of silently adapting nothing.
 */
export const STATUS_REFERENCE_PRODUCTIONS = Object.freeze({
  'mixed-ending': Object.freeze({
    itemClass: 'sb-eol',
    sourceText: 'LF',
    productionText: 'Mixed',
  }),
  'large-file': Object.freeze({
    itemClass: 'sb-count',
    sourceText: '231 words',
    productionText: '420,000 words',
  }),
} satisfies Readonly<
  Record<
    StatusReferenceState,
    Readonly<{ itemClass: string; sourceText: string; productionText: string }>
  >
>);

const STATUS_REFERENCE_VARIANT_STATES = Object.freeze({
  'status-mixed-ending': 'mixed-ending',
  'status-large-file': 'large-file',
} satisfies Readonly<Partial<Record<ReferenceVariant, StatusReferenceState>>>);

export function statusReferenceStateFor(
  variant: ReferenceVariant,
): StatusReferenceState | undefined {
  return (
    STATUS_REFERENCE_VARIANT_STATES as Readonly<
      Record<string, StatusReferenceState | undefined>
    >
  )[variant];
}

export const fileOnlyReferenceStates = [
  'empty',
  'first-run',
  'six-file',
] as const;

export type FileOnlyReferenceState = (typeof fileOnlyReferenceStates)[number];

export const fileOnlyReferenceRecentFiles = Object.freeze([
  ['parity-recent-06.md', '~/Notes/archive'],
  ['parity-recent-05.md', '~/Notes/archive'],
  ['parity-recent-04.md', '~/Notes/archive'],
  ['parity-recent-03.md', '~/Notes/projects'],
  ['parity-recent-02.md', '~/Notes/projects'],
  ['parity-recent-01.md', '~/Notes/projects'],
] as const);

export const fileMenuReferencePlatforms = ['darwin', 'other'] as const;

export type FileMenuReferencePlatform =
  (typeof fileMenuReferencePlatforms)[number];

/**
 * FR-FT-056 requires behavior-owned differences from the historical mockup to
 * be rendered as explicit Feature 003 reference variants built from the same
 * binding primitives, and compared rather than masked. The File menu has four
 * such differences:
 *
 *   1. Recent folders are absent (FR-FT-042), so the mockup's `~/Documents/Notes`
 *      row is not part of the Feature 003 contract.
 *   2. `Reopen last file` replaces `Reopen last file / folder` (T049, FR-FT-041).
 *   3. New Window, Open Folder…, and Export to PDF… are visibly unavailable
 *      deferred actions, using the same primitive the reviewed `file-only`
 *      launcher variant already applies to Open folder….
 *   4. Feature 003 owns its accelerators: reopen is deliberately
 *      `Ctrl/Cmd+Shift+Alt/Option+T` rather than the mockup's `Ctrl ⇧ T`, the
 *      deferred actions carry no registry shortcut, and Exit is OS-owned.
 *
 * The mockup never draws an unavailable menu row — it has no disabled state at
 * all — while the specification requires downstream File actions to be
 * "visibly unavailable". The variant therefore carries Feature 003's own
 * reviewed unavailable opacity so the comparison still measures geometry,
 * labels and spacing instead of collapsing into a colour difference.
 *
 * **T127: the last four are here too now.** New File, Open File, Save and Save
 * As used to keep the mockup's literal `Ctrl N` / `Ctrl O` / `Ctrl S` /
 * `Ctrl ⇧ S` text, and the resulting macOS difference was excused by a
 * rectangle — a mask over glyphs, which FR-FT-055 forbids, in the file whose
 * own header says a mask makes drift invisible forever. Nothing bounded it: no
 * measured ceiling, no maximum channel delta, no shrink rule. They now carry
 * Feature 003's own host-formatted accelerators like every other row, so the
 * glyphs are **compared** instead of skipped, and the exception is gone rather
 * than merely narrowed. `close-tab` has been measured this way since T070 —
 * `⌘W` against the mockup's `.k` primitive, exact — which is why this was
 * always available and never taken.
 *
 * Only the mockup's own primitives are used: `.mi`, `.mi.sub`, `.lab`, `.sep`,
 * `.k`, and `<svg class="ic"><use href="#i-file"/></svg>`. No HTML/CSS value in
 * `docs/delivery/spec/surface/mockup.html` is edited and the raw source hash is
 * unchanged.
 */
const fileMenuReferenceAccelerators: Readonly<
  Record<FileMenuReferencePlatform, Readonly<Record<string, string | null>>>
> = {
  darwin: {
    'new-file': '⌘N',
    'new-window': null,
    'open-file': '⌘O',
    'open-folder': null,
    reopen: '⌘⇧⌥T',
    save: '⌘S',
    'save-as': '⌘⇧S',
    'export-pdf': null,
    'close-tab': '⌘W',
    exit: null,
  },
  other: {
    'new-file': 'Ctrl+N',
    'new-window': null,
    'open-file': 'Ctrl+O',
    'open-folder': null,
    reopen: 'Ctrl+Shift+Alt+T',
    save: 'Ctrl+S',
    'save-as': 'Ctrl+Shift+S',
    'export-pdf': null,
    'close-tab': 'Ctrl+W',
    exit: null,
  },
};

const FILE_MENU_SOURCE_MARKER = '<div class="dropdown" id="m-file"';

function acceleratorSpan(value: string | null): string {
  return value === null ? '' : `<span class="k">${value}</span>`;
}

/**
 * The single reviewed unavailable opacity, shared by every surface that draws a
 * Feature 003 deferred action. It matches production's `--disabled-opacity`.
 */
export const REFERENCE_UNAVAILABLE_OPACITY = '0.48';

function deferredAttributes(): string {
  return (
    ' aria-disabled="true" data-availability="deferred"' +
    ` style="opacity:${REFERENCE_UNAVAILABLE_OPACITY}"`
  );
}

/**
 * Session 2026-08-13 clarification, FR-FT-056. `image`, `format`, `compact` and
 * `lint` are deferred in the action registry, so production draws them visibly
 * unavailable — and Feature 003 may not change a deferred outcome. The mockup
 * has no disabled state anywhere, so without this the toolbar comparison stops
 * measuring geometry and collapses into an opacity difference: measured at
 * 1280px Minimal Light, 751 of the region's 965 differing pixels were nothing
 * but the dimming.
 *
 * This applies the same reviewed treatment `adaptFileMenu` already gives the
 * File menu's deferred rows, to the mockup's own `.tbtn` primitive, and to
 * exactly those four controls. It adds no rule the File menu variant does not
 * already carry, changes no geometry, and leaves the raw source hash untouched.
 */
const DEFERRED_TOOLBAR_CONTROL_TITLES = Object.freeze([
  'Image',
  'Format — ⌥⇧F',
  'Compact — ⌥⇧C',
  'Lint — ⌥⇧L',
] as const);

/**
 * Session 2026-08-13 clarification, FR-FT-056. FR-ED-004 requires the View menu
 * to expose Editor, Split and Preview "in the original mockup order and
 * grouping", but the mockup's `#m-view` has `Show Editor` and `Show Preview`
 * instead — so the two halves of that requirement cannot both hold against the
 * binding. Production keeps FR-ED-004's inventory and the difference is
 * expressed here, exactly as `adaptFileMenu` does for `#m-file`.
 *
 * Three differences, all from the same cause — Feature 003 owns this menu's
 * behaviour while the mockup predates it:
 *
 *   1. The arrangement rows are Editor / Split / Preview, not Show Editor /
 *      Show Preview. The mockup draws both of its rows ticked, which is the
 *      split arrangement, so Split carries the tick and the other two carry the
 *      binding's own `.tick.off` — the box keeps its width either way.
 *   2. `Toggle Assistant` and `Distraction-free reading` are deferred, so they
 *      carry no registry shortcut and production draws them visibly
 *      unavailable. The mockup gives both an accelerator at full opacity.
 *   3. Accelerators are Feature 003's own and are formatted for the host, so
 *      `Toggle Sidebar` reads `⌘\` on macOS where the mockup writes `Ctrl \`.
 *
 * Only the mockup's own primitives are used: `.mi`, `.sep`, `.k`, `.tick`,
 * `.tick.off` and `.tgl`/`.tgl.on`. The switch states are the source's own —
 * Line numbers on, Word wrap off. No HTML/CSS value in
 * `docs/delivery/spec/surface/mockup.html` is edited and the raw source hash is
 * unchanged.
 */
/*
 * `open-logs` and `view-github` are `laterDeferred` in the action registry, so
 * production draws both rows visibly unavailable, and Feature 003 formats the
 * Keyboard shortcuts accelerator for the host. The binding draws no disabled
 * state and hard-codes `Ctrl ?`, so without this the comparison collapses into
 * an opacity-and-glyph difference instead of measuring the row geometry —
 * exactly the treatment FR-FT-056 already grants the File and View menus.
 */
const aboutMenuReferenceAccelerators: Readonly<
  Record<FileMenuReferencePlatform, Readonly<Record<string, string | null>>>
> = {
  darwin: { 'keyboard-shortcuts': '⌘?' },
  other: { 'keyboard-shortcuts': 'Ctrl+?' },
};

const ABOUT_MENU_SOURCE_MARKER = '<div class="dropdown" id="m-about"';

const viewMenuReferenceAccelerators: Readonly<
  Record<FileMenuReferencePlatform, Readonly<Record<string, string | null>>>
> = {
  darwin: {
    'toggle-sidebar': '⌘\\',
    'toggle-assistant': null,
    'distraction-free-reading': null,
    fullscreen: 'F11',
  },
  other: {
    'toggle-sidebar': 'Ctrl+\\',
    'toggle-assistant': null,
    'distraction-free-reading': null,
    fullscreen: 'F11',
  },
};

/**
 * `spec.md:599`: "The completed operating-system-managed frame supersedes the
 * mockup's obsolete custom traffic lights, drag region, resize zones, and outer
 * window shadow."
 *
 * The traffic lights are the only part of the title bar's leading run that the
 * operating system draws for us, so they are not part of the Feature 003
 * contract and the application does not reproduce them. Removing them here is
 * what lets the rest of the row — the brand, the menu, the identity — sit at a
 * position both pages derive from their own layout. The alternative, leaving
 * them in and giving production a 52px + 12px reservation to compensate, would
 * put dead space in the shipped window for a control that lives in the
 * operating system's own title bar.
 *
 * Only the mockup's own markup is touched: the `.lights` element is removed
 * whole. No HTML/CSS value is edited and the raw source hash is unchanged.
 */
const LIGHTS_SOURCE_MARKUP =
  '<div class="lights"><i class="r"></i><i class="y"></i><i class="g"></i></div>';

function adaptNativeFrameControls(html: string): string {
  // A source without the title bar at all is not a parity reference; leave it
  // untouched so unit fixtures can exercise the other variants in isolation.
  if (!html.includes(LIGHTS_SOURCE_MARKUP)) return html;
  return html.replace(LIGHTS_SOURCE_MARKUP, '');
}

const VIEW_MENU_SOURCE_MARKER = '<div class="dropdown" id="m-view"';

/**
 * Feature 003 owns its accelerators, so they are formatted for the host the
 * application is actually running on — the same rule the File menu already
 * follows, and the same host the browser under test runs on. The File menu
 * receives its platform explicitly because the manifest pins it per case; the
 * View menu appears in every variant, so it defaults to the host here.
 */
function hostReferencePlatform(): FileMenuReferencePlatform {
  return process.platform === 'darwin' ? 'darwin' : 'other';
}

function tickSpan(selected: boolean): string {
  return `<span class="tick${selected ? '' : ' off'}">✓</span>`;
}

function adaptViewMenu(
  html: string,
  platform: FileMenuReferencePlatform,
): string {
  // A source without the View menu at all is not a parity reference; leave it
  // untouched so unit fixtures can exercise the other variants in isolation,
  // exactly as `adaptPreviewPane` does.
  const start = html.indexOf(VIEW_MENU_SOURCE_MARKER);
  if (start < 0) return html;
  const open = html.indexOf('>', start);
  const end = html.indexOf(
    '</div>\n    <div class="dropdown" id="m-about"',
    open,
  );
  if (end < 0) {
    throw new Error('View-menu reference source region is malformed');
  }
  for (const required of ['class="tick"', 'class="tgl on"', 'class="sep"']) {
    if (!html.slice(open, end).includes(required)) {
      throw new Error(
        `View-menu reference source lost the required primitive: ${required}`,
      );
    }
  }
  const shortcut = viewMenuReferenceAccelerators[platform];
  const adapted = [
    '',
    `<div class="mi"><span>Toggle Sidebar</span>${acceleratorSpan(shortcut['toggle-sidebar'])}</div>`,
    `<div class="mi"${deferredAttributes()}><span>Toggle Assistant</span>${acceleratorSpan(shortcut['toggle-assistant'])}</div>`,
    `<div class="mi"><span>Editor</span>${tickSpan(false)}</div>`,
    `<div class="mi"><span>Split</span>${tickSpan(true)}</div>`,
    `<div class="mi"><span>Preview</span>${tickSpan(false)}</div>`,
    '<div class="sep"></div>',
    '<div class="mi"><span>Line numbers</span><span class="tgl on"></span></div>',
    '<div class="mi"><span>Word wrap</span><span class="tgl"></span></div>',
    '<div class="sep"></div>',
    `<div class="mi"${deferredAttributes()}><span>Distraction-free reading</span>${acceleratorSpan(shortcut['distraction-free-reading'])}</div>`,
    `<div class="mi"><span>Full screen</span>${acceleratorSpan(shortcut['fullscreen'])}</div>`,
    '',
  ].join('\n      ');
  return html.slice(0, open + 1) + adapted + html.slice(end);
}

function adaptAboutMenu(
  html: string,
  platform: FileMenuReferencePlatform,
): string {
  // A source without the About menu is not a parity reference; leave it
  // untouched so unit fixtures can exercise the other variants in isolation.
  const start = html.indexOf(ABOUT_MENU_SOURCE_MARKER);
  if (start < 0) return html;
  const open = html.indexOf('>', start);
  // Point at the `</div>` that closes `#m-about` itself, not at the one closing
  // its last row — otherwise the replacement leaves an unbalanced tag and the
  // whole document collapses.
  const end = html.indexOf('\n    </div>\n  </div>', open);
  if (end < 0) {
    throw new Error('About-menu reference source region is malformed');
  }
  for (const required of ['class="k"', 'class="sep"', 'class="mi"']) {
    if (!html.slice(open, end).includes(required)) {
      throw new Error(
        `About-menu reference source lost the required primitive: ${required}`,
      );
    }
  }
  const shortcut = aboutMenuReferenceAccelerators[platform];
  const adapted = [
    '',
    `<div class="mi"><span>Keyboard shortcuts</span>${acceleratorSpan(shortcut['keyboard-shortcuts'])}</div>`,
    '<div class="sep"></div>',
    `<div class="mi"${deferredAttributes()}><span>Open logs folder</span></div>`,
    `<div class="mi"${deferredAttributes()}><span>View on GitHub (MIT)</span></div>`,
    '<div class="sep"></div>',
    '<div class="mi"><span>About GoMarkEdit</span></div>',
    '',
  ].join('\n      ');
  return html.slice(0, open + 1) + adapted + html.slice(end);
}

/*
 * `format-on-save` and `lint-on-save` are `laterDeferred` in the action
 * registry, so production draws both rows visibly unavailable. The binding has
 * no disabled state anywhere, so without this the comparison would collapse
 * into an opacity difference instead of measuring the row geometry — exactly
 * what FR-FT-056 already grants the File menu and the deferred toolbar
 * controls.
 */
const DEFERRED_SETTINGS_ROW_LABELS = Object.freeze([
  'Format on save',
  'Lint on save',
] as const);

const SETTINGS_SOURCE_MARKER = '<div class="dropdown" id="m-settings"';

const TOOLBAR_SOURCE_MARKER = '<div class="toolbar">';

function adaptDeferredToolbarControls(html: string): string {
  // A source without the toolbar at all is not a parity reference; leave it
  // untouched so unit fixtures can exercise the other variants in isolation.
  const start = html.indexOf(TOOLBAR_SOURCE_MARKER);
  if (start < 0) return html;
  const end = html.indexOf('</div>\n      </div>', start);
  if (end < 0) {
    throw new Error('Toolbar reference source region is malformed');
  }
  let toolbar = html.slice(start, end);
  for (const title of DEFERRED_TOOLBAR_CONTROL_TITLES) {
    const button = `<button class="tbtn`;
    const marker = `title="${title}"`;
    const at = toolbar.indexOf(marker);
    if (at < 0) {
      throw new Error(
        `Toolbar reference source lost the deferred control: ${title}`,
      );
    }
    const openedAt = toolbar.lastIndexOf(button, at);
    if (openedAt < 0) {
      throw new Error(
        `Toolbar deferred control is not a .tbtn primitive: ${title}`,
      );
    }
    const closedAt = toolbar.indexOf('>', at);
    toolbar =
      toolbar.slice(0, closedAt) +
      deferredAttributes() +
      toolbar.slice(closedAt);
  }
  return html.slice(0, start) + toolbar + html.slice(end);
}

/**
 * T112. Feature 003 owns its accelerators, so the Settings popup's one
 * accelerator is formatted for the host the application is running on — exactly
 * the rule `adaptViewMenu` and `adaptAboutMenu` already follow, and the same
 * host the browser under test runs on.
 *
 * This is deliberately a reference *variant* rather than a fifth entry in the
 * reviewed macOS glyph exception. FR-FT-056 requires behavior-owned differences
 * from the historical mockup to be "compared rather than masked", and the
 * exception list is capped at the four rows the T059 decision preserves as
 * literal `Ctrl` reference text. Expressing the real accelerator here keeps the
 * `All settings…` row measured exactly — glyphs, spacing and geometry — instead
 * of adding a rectangle the comparator is told to forgive.
 *
 * The mockup writes `Ctrl ,` here (`mockup.html:624`), which was correct for a
 * platform-blind reference and is wrong on macOS, where `⌘,` is the key that
 * dispatches. Production reads the binding from the action registry; so does
 * this. Only the mockup's own `.k` primitive is used, and no HTML/CSS value in
 * `docs/delivery/spec/surface/mockup.html` is edited.
 */
const settingsMenuReferenceAccelerators: Readonly<
  Record<FileMenuReferencePlatform, string>
> = {
  darwin: '⌘,',
  other: 'Ctrl+,',
};

const SETTINGS_ACCELERATOR_SOURCE_MARKUP = '<span class="k">Ctrl ,</span>';

function adaptDeferredSettingsRows(
  html: string,
  platform: FileMenuReferencePlatform,
): string {
  // A source without the Settings popup is not a parity reference; leave it
  // untouched so unit fixtures can exercise the other variants in isolation.
  const start = html.indexOf(SETTINGS_SOURCE_MARKER);
  if (start < 0) return html;
  const end = html.indexOf('</div>', html.indexOf('All settings', start));
  if (end < 0) {
    throw new Error('Settings reference source region is malformed');
  }
  let settings = html.slice(start, end);
  if (!settings.includes(SETTINGS_ACCELERATOR_SOURCE_MARKUP)) {
    throw new Error(
      'Settings reference source lost the All settings accelerator',
    );
  }
  settings = settings.replace(
    SETTINGS_ACCELERATOR_SOURCE_MARKUP,
    acceleratorSpan(settingsMenuReferenceAccelerators[platform]),
  );
  for (const label of DEFERRED_SETTINGS_ROW_LABELS) {
    const marker = `<span>${label}</span>`;
    const at = settings.indexOf(marker);
    if (at < 0) {
      throw new Error(
        `Settings reference source lost the deferred row: ${label}`,
      );
    }
    const openedAt = settings.lastIndexOf('<div class="mi"', at);
    if (openedAt < 0) {
      throw new Error(`Settings deferred row is not a .mi primitive: ${label}`);
    }
    const closedAt = settings.indexOf('>', openedAt);
    settings =
      settings.slice(0, closedAt) +
      deferredAttributes() +
      settings.slice(closedAt);
  }
  return html.slice(0, start) + settings + html.slice(end);
}

/**
 * T143, FR-FT-047 and FR-FT-056. The narrow toolbar overflow advertises eight
 * accelerators. Production used to draw them from a hardcoded string table
 * inside `EditorChrome.tsx` that copied the mockup verbatim — `Ctrl ⇧ 8` for an
 * action the registry binds to `Mod+Shift+8` — so on macOS the popup told the
 * user to press a key that dispatches nothing. It now derives every one of them
 * from `formatShortcut(getAction(id).shortcut, currentPlatform())`, the same
 * single source the File, View, About and Settings surfaces already use.
 *
 * The mockup's literals were correct for a platform-blind reference and are
 * wrong on macOS, so the reference expresses Feature 003's own accelerators
 * here — exactly what `adaptDeferredSettingsRows` does for `Ctrl ,` and
 * `adaptViewMenu` for `Ctrl \`. FR-FT-056 requires a behavior-owned difference
 * to be rendered as an explicit reference variant built from the same binding
 * primitives and *compared*, not masked with a forgiveness rectangle: only the
 * mockup's own `.mi` row and its inline accelerator span are used, no HTML/CSS
 * value in `docs/delivery/spec/surface/mockup.html` is edited, and the raw
 * source hash is unchanged.
 */
const overflowMenuReferenceAccelerators: Readonly<
  Record<FileMenuReferencePlatform, Readonly<Record<string, string>>>
> = {
  darwin: {
    'Bullet list': '⌘⇧8',
    'Numbered list': '⌘⇧7',
    'Task list': '⌘⇧9',
    Quote: '⌘⇧.',
    Link: '⌘K',
    Image: '⌘⇧I',
    Table: '⌘⇧T',
    Compact: '⌥⇧C',
  },
  other: {
    'Bullet list': 'Ctrl+Shift+8',
    'Numbered list': 'Ctrl+Shift+7',
    'Task list': 'Ctrl+Shift+9',
    Quote: 'Ctrl+Shift+.',
    Link: 'Ctrl+K',
    Image: 'Ctrl+Shift+I',
    Table: 'Ctrl+Shift+T',
    Compact: 'Alt+Shift+C',
  },
};

/**
 * The mockup's own literal for each row, so a source that stops writing one
 * fails loudly here rather than silently leaving the reference unadapted.
 */
const OVERFLOW_ACCELERATOR_SOURCE_TEXT: Readonly<Record<string, string>> = {
  'Bullet list': 'Ctrl ⇧ 8',
  'Numbered list': 'Ctrl ⇧ 7',
  'Task list': 'Ctrl ⇧ 9',
  Quote: 'Ctrl ⇧ .',
  Link: 'Ctrl K',
  Image: 'Ctrl ⇧ I',
  Table: 'Ctrl ⇧ T',
  Compact: '⌥⇧C',
};

const OVERFLOW_MENU_SOURCE_MARKER = '<div class="ovf-menu">';

const OVERFLOW_ACCELERATOR_SPAN_OPEN =
  '<span style="margin-left:auto;color:var(--faint)">';

function adaptOverflowMenuAccelerators(
  html: string,
  platform: FileMenuReferencePlatform,
): string {
  // A source without the overflow menu is not a parity reference; leave it
  // untouched so unit fixtures can exercise the other variants in isolation.
  const start = html.indexOf(OVERFLOW_MENU_SOURCE_MARKER);
  if (start < 0) return html;
  const end = html.indexOf('</div>', html.indexOf('ovf-menus', start));
  if (end < 0) {
    throw new Error('Overflow-menu reference source region is malformed');
  }
  let overflow = html.slice(start, end);
  const shortcut = overflowMenuReferenceAccelerators[platform];
  for (const [label, source] of Object.entries(
    OVERFLOW_ACCELERATOR_SOURCE_TEXT,
  )) {
    const from = `<div class="mi">${label}${OVERFLOW_ACCELERATOR_SPAN_OPEN}${source}</span></div>`;
    if (!overflow.includes(from)) {
      throw new Error(
        `Overflow-menu reference source lost the accelerator row: ${label}`,
      );
    }
    overflow = overflow.replace(
      from,
      `<div class="mi">${label}${OVERFLOW_ACCELERATOR_SPAN_OPEN}${shortcut[label] ?? ''}</span></div>`,
    );
  }
  return html.slice(0, start) + overflow + html.slice(end);
}

/**
 * Feature 003's reviewed status-item containment, matching production's
 * `.responsiveItem` (`frontend/src/ui/components/StatusBar.module.css:27-36`).
 *
 * spec.md:1152 requires the status row never to grow, and spec.md:261 requires
 * it to shorten in the binding's own fixed drop order; T063 asserts that no
 * status item wraps and that the row never overflows its own client width. The
 * binding expresses none of that on `.statusbar .b` — it relies on width-scoped
 * `display:none` rules (`mockup.html:82-83`) and on its demonstration strings
 * being short. Without this the two status comparisons collapse into a
 * containment-style difference instead of measuring the glyphs, which is the
 * same failure mode the reviewed deferred-opacity treatment already prevents
 * for the File menu, the View menu and the toolbar.
 *
 * It has no rendering effect on either compared span — neither `Mixed` nor
 * `420,000 words` can wrap or overflow at any compared width — so it changes
 * what is measured, never what is drawn.
 */
export const REFERENCE_STATUS_ITEM_CONTAINMENT =
  'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

const STATUS_BAR_SOURCE_MARKER = '<div class="statusbar">';

/**
 * Rewrite exactly one of the binding's own status spans to the text production
 * renders for `state`, leaving every other byte of `.statusbar` untouched. This
 * is a Node-side string transform on the immutable source, in the same shape as
 * `adaptDeferredToolbarControls`, `adaptViewMenu` and `adaptFileMenu`: no
 * HTML/CSS value in `docs/delivery/spec/surface/mockup.html` is edited and the
 * raw source hash is unchanged.
 */
export function adaptStatusBar(
  html: string,
  state: StatusReferenceState,
): string {
  // A source without the status bar at all is not a parity reference; leave it
  // untouched so unit fixtures can exercise the other variants in isolation.
  const start = html.indexOf(STATUS_BAR_SOURCE_MARKER);
  if (start < 0) return html;
  const end = html.indexOf('\n  </div>', start);
  if (end < 0) {
    throw new Error('Status-bar reference source region is malformed');
  }
  const statusBar = html.slice(start, end);
  for (const required of ['class="b sb-eol"', 'class="b sb-count"']) {
    if (!statusBar.includes(required)) {
      throw new Error(
        `Status-bar reference source lost the required primitive: ${required}`,
      );
    }
  }
  const production = STATUS_REFERENCE_PRODUCTIONS[state];
  const sourceSpan = `<span class="b ${production.itemClass}">${production.sourceText}</span>`;
  if (!statusBar.includes(sourceSpan)) {
    throw new Error(
      `Status-bar reference source lost the ${state} condition: ${sourceSpan}`,
    );
  }
  const adaptedSpan =
    `<span class="b ${production.itemClass}"` +
    ` style="${REFERENCE_STATUS_ITEM_CONTAINMENT}">` +
    `${production.productionText}</span>`;
  return (
    html.slice(0, start) +
    statusBar.replace(sourceSpan, adaptedSpan) +
    html.slice(end)
  );
}

function adaptFileMenu(
  html: string,
  platform: FileMenuReferencePlatform,
): string {
  const start = html.indexOf(FILE_MENU_SOURCE_MARKER);
  if (start < 0) {
    throw new Error('File-menu reference requires the source #m-file region');
  }
  const open = html.indexOf('>', start);
  const end = html.indexOf(
    '</div>\n    <div class="dropdown" id="m-settings"',
    open,
  );
  if (open < 0 || end < 0) {
    throw new Error('File-menu reference source region is malformed');
  }
  const original = html.slice(open + 1, end);
  for (const required of [
    'New File<span class="k">Ctrl N</span>',
    'Open File…<span class="k">Ctrl O</span>',
    'Save<span class="k">Ctrl S</span>',
    'Save As…<span class="k">Ctrl ⇧ S</span>',
    '<div class="lab">Open Recent</div>',
    '<use href="#i-folder"/>',
  ]) {
    if (!original.includes(required)) {
      throw new Error(
        `File-menu reference source lost the binding primitive: ${required}`,
      );
    }
  }
  const shortcut = fileMenuReferenceAccelerators[platform];
  const fileIcon = '<svg class="ic"><use href="#i-file"/></svg>';
  const adapted = [
    `\n      <div class="mi">New File${acceleratorSpan(shortcut['new-file'])}</div>`,
    `<div class="mi"${deferredAttributes()}>New Window${acceleratorSpan(shortcut['new-window'])}</div>`,
    `<div class="mi">Open File…${acceleratorSpan(shortcut['open-file'])}</div>`,
    `<div class="mi"${deferredAttributes()}>Open Folder…${acceleratorSpan(shortcut['open-folder'])}</div>`,
    '<div class="sep"></div><div class="lab">Open Recent</div>',
    `<div class="mi sub">${fileIcon} release-notes.md</div>`,
    `<div class="mi sub">${fileIcon} spec-draft.md</div>`,
    `<div class="mi sub" aria-disabled="true" style="opacity:${REFERENCE_UNAVAILABLE_OPACITY}">↺ Reopen last file${acceleratorSpan(shortcut['reopen'])}</div>`,
    '<div class="sep"></div>',
    `<div class="mi">Save${acceleratorSpan(shortcut['save'])}</div><div class="mi">Save As…${acceleratorSpan(shortcut['save-as'])}</div>`,
    `<div class="sep"></div><div class="mi"${deferredAttributes()}>Export to PDF…${acceleratorSpan(shortcut['export-pdf'])}</div>`,
    `<div class="sep"></div><div class="mi">Close Tab${acceleratorSpan(shortcut['close-tab'])}</div><div class="mi">Exit${acceleratorSpan(shortcut['exit'])}</div>`,
    '\n    ',
  ].join('\n      ');
  return html.slice(0, open + 1) + adapted + html.slice(end);
}

/**
 * Session 2026-08-13 clarification. The mockup's preview pane demonstrates
 * deferred rich-rendering expansion — a remote-content banner, an image
 * placeholder, KaTeX math and an inline Mermaid diagram. Those are excluded
 * rather than reproduced, so the Feature 003 reference variant carries the same
 * in-scope basic-preview content the application renders for the parity
 * document, expressed only through the mockup's own `.preview-in` primitives.
 *
 * The binding typography (`.preview h1/h2/p/ul/li/blockquote/pre`) is untouched
 * and remains the comparison target; only the demonstration content changes.
 */
export const IN_SCOPE_PREVIEW_CONTENT = [
  '<h1>Release Notes — v2.1</h1>',
  '<p>We are exited to anounce the new relase. This verison brings alot of improvments and fixs users asked for.</p>',
  '<h2>Highlights</h2>',
  '<ul><li>Faster startup</li><li>KaTeX math: $E = mc^2$</li><li><em>flow</em></li></ul>',
  '<blockquote><p>Tip: press Ctrl+S to save.</p></blockquote>',
  '<pre><code>graph LR; A--&gt;B; B--&gt;C;\n</code></pre>',
].join('\n              ');

/**
 * The editor pane header's selection readout, removed rather than manufactured.
 *
 * The mockup's pane header carries `· sel 42w` (`mockup.html:726`). Feature 003
 * builds no selection readout — the pane header shows encoding and line ending
 * and nothing else — so `EditorView` used to render a hardcoded `sel 42w` on
 * `?parity-case` to make the two sides agree. That is manufacturing a surface in
 * production to satisfy the harness, and the 2026-08-13 clarification recorded
 * against this very region says the opposite is required: out-of-scope reference
 * content "removed from the reference rather than manufactured in production",
 * exactly as the deferred rich-rendering widgets are.
 *
 * The pane header and its metadata stay fully compared; only this one readout
 * leaves, and the separator with it so no orphan `·` remains.
 */
const PANE_SELECTION_SOURCE_MARKUP =
  ' · <span style="color:var(--accent-ink)">sel 42w</span>';

function adaptEditorPaneSelection(html: string): string {
  // A source without the editor pane at all is not a parity reference; leave it
  // untouched so unit fixtures can exercise the other variants in isolation —
  // the same allowance `adaptPreviewPane` makes for the same reason.
  if (!html.includes('id="pane-editor"')) return html;
  if (!html.includes(PANE_SELECTION_SOURCE_MARKUP)) {
    throw new Error(
      'Editor pane reference requires the source selection readout; the adaptation is stale.',
    );
  }
  return html.split(PANE_SELECTION_SOURCE_MARKUP).join('');
}

function adaptPreviewPane(html: string): string {
  // A source without the preview pane at all is not a parity reference; leave
  // it untouched so unit fixtures can exercise the other variants in isolation.
  if (!html.includes('id="pane-preview"')) return html;
  const open = html.indexOf('<div class="preview-in">');
  if (open < 0) {
    throw new Error('Preview reference requires the source preview-in region');
  }
  const end = html.indexOf('\n            </div>', open);
  if (end < 0) {
    throw new Error('Preview reference source region is malformed');
  }
  for (const required of [
    'class="imgph"',
    'class="mermaid"',
    'class="katex"',
  ]) {
    if (!html.slice(open, end).includes(required)) {
      throw new Error(
        `Preview reference source lost the deferred widget marker: ${required}`,
      );
    }
  }
  return (
    html.slice(0, open) +
    '<div class="preview-in">\n              ' +
    IN_SCOPE_PREVIEW_CONTENT +
    html.slice(end)
  );
}

/**
 * spec.md, Clarifications, Session 2026-08-14 (T076/T078). At the native
 * minimum window — 375x480, `main.go:104-105`, a `(max-width: 376px)` viewport —
 * the application draws exactly one pane, and the Split arrangement collapses
 * to the editor because this is a Markdown editor and typing is the primary
 * job. The stored arrangement is untouched: the toolbar and the View menu keep
 * reporting Split while the panes are collapsed, and widening restores both
 * with no user action.
 *
 * The binding predates that decision and stacks both panes at 375
 * (`mockup.html:54` `.app[data-w="375"] .body{flex-direction:column}` with `:55`
 * `.pane{min-height:0;flex:1}`). So the `editor-split` family cannot be
 * captured at 375 against the unmodified binding at all — the reference draws
 * two panes where production draws one.
 *
 * The variant hides the non-selected pane with the binding's own declaration:
 * `mockup.html:299` is `.app.only-editor #pane-preview{display:none}`, and the
 * harness's own `setView('edit')` (`mockup.html:1034-1035`) writes exactly
 * `display:none` onto that element. Nothing else changes — the arrangement
 * segment still shows Split selected, matching what production reports — and
 * `showScreen('editor-split')` never calls `setView`, so the inline value
 * survives the harness's screen click.
 *
 * This is the treatment FR-FT-056 already grants the File menu, the View menu
 * and the toolbar: only the mockup's own primitives are used, no HTML/CSS value
 * in `docs/delivery/spec/surface/mockup.html` is edited, the raw source hash is
 * unchanged, and no mask, tolerance, comparator or coordinate handling moves.
 */
const NARROW_HIDDEN_PANE_SOURCE_MARKER = '<div class="pane" id="pane-preview">';

export const REFERENCE_NARROW_HIDDEN_PANE_STYLE = 'display:none';

export function adaptNarrowSinglePane(html: string): string {
  // A source without the preview pane at all is not a parity reference; leave
  // it untouched so unit fixtures can exercise the other variants in isolation.
  const at = html.indexOf(NARROW_HIDDEN_PANE_SOURCE_MARKER);
  if (at < 0) {
    if (html.includes('id="pane-preview"')) {
      throw new Error(
        'Narrow single-pane reference requires the source #pane-preview element',
      );
    }
    return html;
  }
  if (!html.includes('<div class="pane" id="pane-editor">')) {
    throw new Error(
      'Narrow single-pane reference requires the source #pane-editor element',
    );
  }
  return html.replace(
    NARROW_HIDDEN_PANE_SOURCE_MARKER,
    `<div class="pane" id="pane-preview" style="${REFERENCE_NARROW_HIDDEN_PANE_STYLE}">`,
  );
}

export type ReferenceStateCondition = Readonly<{
  readonly status: 'supported' | 'unresolved';
  readonly reason?: string;
}>;

/**
 * The historical mockup has a generic save prompt but no distinct
 * normalization prompt. Keep this contract explicit so a behavior-owned
 * state cannot accidentally reuse that neighboring reference capture.
 */
export const unresolvedReferenceStateConditions = Object.freeze({
  'prompt-normalization': Object.freeze({
    status: 'unresolved',
    reason:
      'The immutable binding mockup has no source-backed Normalize line endings? condition.',
  }),
} satisfies Readonly<Record<string, ReferenceStateCondition>>);

export function referenceStateCondition(
  stateId: string,
): ReferenceStateCondition {
  const conditions = unresolvedReferenceStateConditions as Readonly<
    Record<string, ReferenceStateCondition>
  >;
  return conditions[stateId] ?? { status: 'supported' };
}

type VariantRule = Readonly<{
  readonly allowedRegions: readonly string[];
  readonly excludedRegions: readonly string[];
}>;

/**
 * `excludedRegions` is matched as a substring against a mapping's `regionId`, so
 * each name here must not appear inside a region that is legitimately compared.
 * `monaco` names the Feature 002-owned editor interior that FR-FT-055 excludes;
 * it is deliberately not spelled `editor`, because `editor-pane` is an allowed
 * region of `editor-split-375` and `editor` is a live `regionId` in
 * `real-files-parity.test.ts`, so the shorter name would exclude the very
 * mappings the contract requires. The exclusion is universal — it appears on
 * `base` too — because no variant may ever compare the editor interior.
 */
const variantRules: Readonly<Record<ReferenceVariant, VariantRule>> = {
  base: { allowedRegions: [], excludedRegions: ['monaco'] },
  'file-only': {
    allowedRegions: ['launcher', 'file-menu', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering', 'monaco'],
  },
  'file-menu': {
    allowedRegions: ['file-menu', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering', 'monaco'],
  },
  conflict: {
    allowedRegions: ['reload-prompt', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering', 'monaco'],
  },
  'move-tab': {
    allowedRegions: ['tab-menu', 'tabs'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering', 'monaco'],
  },
  'status-mixed-ending': {
    allowedRegions: ['status-bar'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering', 'monaco'],
  },
  'status-large-file': {
    allowedRegions: ['status-bar'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering', 'monaco'],
  },
  'editor-split-375': {
    allowedRegions: ['editor-pane', 'toolbar', 'tabs', 'settings-overflow'],
    excludedRegions: ['workspace', 'assistant', 'rich-rendering', 'monaco'],
  },
};

export interface ReferenceAdapterResult {
  readonly adapterHash: string;
  readonly sourceHash: string;
  readonly variant: ReferenceVariant;
  readonly html: string;
  readonly rules: VariantRule;
  readonly fileOnlyState?: FileOnlyReferenceState;
  readonly fileMenuPlatform?: FileMenuReferencePlatform;
  readonly statusState?: StatusReferenceState;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const REFERENCE_ADAPTER_HASH = hash(
  JSON.stringify({
    REFERENCE_ADAPTER_VERSION,
    REFERENCE_ZERO_ASSISTANT_CLASS,
    fileOnlyReferenceStates,
    fileOnlyReferenceRecentFiles,
    fileMenuReferenceAccelerators,
    REFERENCE_UNAVAILABLE_OPACITY,
    DEFERRED_TOOLBAR_CONTROL_TITLES,
    DEFERRED_SETTINGS_ROW_LABELS,
    settingsMenuReferenceAccelerators,
    SETTINGS_ACCELERATOR_SOURCE_MARKUP,
    overflowMenuReferenceAccelerators,
    OVERFLOW_ACCELERATOR_SOURCE_TEXT,
    viewMenuReferenceAccelerators,
    aboutMenuReferenceAccelerators,
    LIGHTS_SOURCE_MARKUP,
    IN_SCOPE_PREVIEW_CONTENT,
    PANE_SELECTION_SOURCE_MARKUP,
    statusReferenceStates,
    STATUS_REFERENCE_PRODUCTIONS,
    STATUS_REFERENCE_VARIANT_STATES,
    REFERENCE_STATUS_ITEM_CONTAINMENT,
    NARROW_HIDDEN_PANE_SOURCE_MARKER,
    REFERENCE_NARROW_HIDDEN_PANE_STYLE,
    variantRules,
  }),
);

function assertVariant(variant: string): asserts variant is ReferenceVariant {
  if (!referenceVariants.includes(variant as ReferenceVariant)) {
    throw new Error(`Unsupported reference variant: ${variant}`);
  }
}

function assertFileOnlyState(
  variant: ReferenceVariant,
  state: FileOnlyReferenceState | undefined,
): void {
  if (state !== undefined && variant !== 'file-only') {
    throw new Error(
      'File-only reference state ' + state + ' requires the file-only variant',
    );
  }
}

function adaptFileOnlyLauncher(
  html: string,
  state: FileOnlyReferenceState,
): string {
  if (!html.includes('class="launcher"')) {
    throw new Error('File-only reference requires the launcher source region');
  }
  if (!html.includes('>Open folder…</button>')) {
    throw new Error(
      'File-only reference requires the source Open Folder control',
    );
  }

  const withUnavailableFolder = html.replace(
    '>Open folder…</button>',
    ' disabled aria-disabled="true" data-availability="deferred">Open folder…</button>',
  );
  const recentFileRows = fileOnlyReferenceRecentFiles.map(
    ([name, parent]) =>
      '<div class="r"><svg class="ic"><use href="#i-file"/></svg>' +
      name +
      '<small>' +
      parent +
      '</small></div>',
  );
  const recentContent =
    state === 'six-file'
      ? recentFileRows.join('')
      : '<div class="r" data-no-recent-files="true">No recent files</div>';
  const recentRegion = withUnavailableFolder.match(
    /(<div class="rec">)[\s\S]*?(<\/div>\s*<\/div>\s*<\/div>)/u,
  );
  if (recentRegion === null) {
    throw new Error('File-only reference recent region is malformed');
  }
  const adaptedRecentRegion =
    recentRegion[1] +
    '<div class="lbl">Recent</div>' +
    recentContent +
    recentRegion[2];
  const adapted = withUnavailableFolder.replace(
    recentRegion[0],
    adaptedRecentRegion,
  );
  if (adapted === withUnavailableFolder) {
    throw new Error('File-only reference recent region was not adapted');
  }
  return adapted;
}

/**
 * The adapter is deliberately declarative. It records the reviewed variant
 * and permitted region boundary and activates the mockup's existing
 * zero-Assistant class without changing the source HTML/CSS values or adding
 * masks. T035 owns the browser-side region mapping for each manifest case.
 */
export function adaptReferenceHtml(
  html: string,
  variant: ReferenceVariant = 'base',
  fileOnlyState?: FileOnlyReferenceState,
  fileMenuPlatform?: FileMenuReferencePlatform,
): ReferenceAdapterResult {
  assertVariant(variant);
  assertFileOnlyState(variant, fileOnlyState);
  const rules = variantRules[variant];
  const marker = `data-reference-variant="${variant}"`;
  const withVariantMarker = html.includes(marker)
    ? html
    : html.replace(/<body\b/u, `<body ${marker}`);
  const withZeroAssistant = withVariantMarker.replace(
    '<div class="app" id="app">',
    `<div class="app ${REFERENCE_ZERO_ASSISTANT_CLASS}" id="app">`,
  );
  const withFileOnly =
    variant === 'file-only' && fileOnlyState !== undefined
      ? adaptFileOnlyLauncher(withZeroAssistant, fileOnlyState)
      : withZeroAssistant;
  const withNativeFrame = adaptNativeFrameControls(withFileOnly);
  const withInScopePreview = adaptPreviewPane(withNativeFrame);
  const withoutPaneSelection = adaptEditorPaneSelection(withInScopePreview);
  const withDeferredToolbar =
    adaptDeferredToolbarControls(withoutPaneSelection);
  const withDeferredSettings = adaptDeferredSettingsRows(
    withDeferredToolbar,
    fileMenuPlatform ?? hostReferencePlatform(),
  );
  const withOverflowMenu = adaptOverflowMenuAccelerators(
    withDeferredSettings,
    fileMenuPlatform ?? hostReferencePlatform(),
  );
  const withViewMenu = adaptViewMenu(
    withOverflowMenu,
    fileMenuPlatform ?? hostReferencePlatform(),
  );
  const withAboutMenu = adaptAboutMenu(
    withViewMenu,
    fileMenuPlatform ?? hostReferencePlatform(),
  );
  const withFileMenu =
    variant === 'file-menu'
      ? adaptFileMenu(withAboutMenu, fileMenuPlatform ?? 'other')
      : withAboutMenu;
  const statusState = statusReferenceStateFor(variant);
  const withStatusBar =
    statusState === undefined
      ? withFileMenu
      : adaptStatusBar(withFileMenu, statusState);
  const adaptedHtml =
    variant === 'editor-split-375'
      ? adaptNarrowSinglePane(withStatusBar)
      : withStatusBar;
  return {
    adapterHash: REFERENCE_ADAPTER_HASH,
    sourceHash: hash(html),
    variant,
    html: adaptedHtml,
    rules,
    fileOnlyState,
    fileMenuPlatform:
      variant === 'file-menu' ? (fileMenuPlatform ?? 'other') : undefined,
    statusState,
  };
}

export function referenceVariantRules(variant: ReferenceVariant): VariantRule {
  return variantRules[variant];
}
