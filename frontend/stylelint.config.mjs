const colourLiteral =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(|\b(?:white|black|red|green|blue|yellow|orange|purple|pink|brown|gray|grey|silver|navy|teal|maroon|olive|lime|aqua|cyan|magenta|fuchsia|gold|beige|ivory|coral|salmon|khaki|indigo|violet|crimson|tomato|orchid|plum|tan|wheat)\b/i;
const themeSelector = /\[data-(?:theme|mode)(?:[\s~|^$*]?=|\])|\bdata-parity\b/i;
const elevationShadow = /--(?:win-shadow|context-menu-shadow)\b/;

const tokenRules = {
  'declaration-property-value-disallowed-list': {
    '/.*/': [colourLiteral],
    '/^box-shadow$/': [elevationShadow],
  },
};

export default {
  rules: {
    ...tokenRules,
    'selector-disallowed-list': [themeSelector],
  },
  overrides: [
    {
      files: ['src/ui/styles/tokens.css'],
      rules: {
        'declaration-property-value-disallowed-list': null,
        'selector-disallowed-list': null,
      },
    },
    {
      files: [
        'src/ui/components/**/*.module.css',
        'src/ui/primitives/**/*.module.css',
      ],
      rules: { 'selector-disallowed-list': null },
    },
    {
      files: [
        'src/ui/components/Popup/Popup.module.css',
        'src/ui/components/ModalShell/ModalShell.module.css',
      ],
      rules: {
        'declaration-property-value-disallowed-list': {
          '/.*/': [colourLiteral],
        },
      },
    },
    {
      files: ['src/logic/theme/generatedHighlight.css'],
      rules: { 'declaration-property-value-disallowed-list': null },
    },
  ],
};
