/** @type {import('jest').Config} */
export default {
  projects: [
    {
      displayName: 'unit',
      clearMocks: true,
      setupFilesAfterEnv: ['<rootDir>/tests/support/setup.ts'],
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts?(x)'],
      moduleNameMapper: {
        '^.+\\.module\\.css$': '<rootDir>/tests/support/styleMock.ts',
        '^wailsjs/(.*)$': '<rootDir>/wailsjs/$1',
      },
      transformIgnorePatterns: [],
      transform: {
        '^.+\\.(?:[tj]sx?|mjs)$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/tsconfig.test.json',
          },
        ],
      },
    },
    {
      displayName: 'integration',
      clearMocks: true,
      setupFilesAfterEnv: ['<rootDir>/tests/support/setup.ts'],
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts?(x)'],
      moduleNameMapper: {
        '^.+\\.module\\.css$': '<rootDir>/tests/support/styleMock.ts',
        '^wailsjs/(.*)$': '<rootDir>/wailsjs/$1',
      },
      transformIgnorePatterns: [],
      transform: {
        '^.+\\.(?:[tj]sx?|mjs)$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/tsconfig.test.json',
          },
        ],
      },
    },
  ],
};
