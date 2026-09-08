/** @type {import('jest').Config} */
export default {
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/src/**/*.test.ts?(x)',
    '<rootDir>/e2e/parity/**/*.test.ts',
  ],
  moduleNameMapper: {
    '^.+\\.module\\.css$': '<rootDir>/src/test/styleMock.ts',
    '^\\.\\./\\.\\./i18n$': '<rootDir>/src/test/i18nShim.ts',
    '^wailsjs/(.*)$': '<rootDir>/wailsjs/$1',
  },
  transformIgnorePatterns: [],
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
};
