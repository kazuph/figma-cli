module.exports = {
  // Use the ESM preset to support ES modules properly
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  
  // Tell Jest to treat .ts and .tsx files as ES modules
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  
  // Configure TypeScript transformation with optimized settings
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
      useESM: true,
    }],
  },
  
  // Support for various file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Path mappings and module resolution
  moduleNameMapper: {
    // Handle ~ path alias with .js extension FIRST (more specific)
    '^~/(.*)\.js$': '<rootDir>/src/$1',
    // Handle .js imports in TypeScript files (for ESM compatibility)
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // General ~ path alias support (fallback)
    '^~/(.*)$': '<rootDir>/src/$1',
  },
  
  // Specify where to look for test files
  roots: ['<rootDir>/src'],
  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx,js,jsx}',
    '<rootDir>/src/**/__tests__/**/*.{ts,tsx,js,jsx}',
  ],
  
  // Coverage collection settings
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.{ts,tsx}',
  ],
  
  // Directories to ignore during testing
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/project.worktree/',
    '<rootDir>/figma-security-fix/',
    '<rootDir>/.git/',
  ],
  
  // More comprehensive ignore patterns to avoid conflicts
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/project.worktree/',
    '<rootDir>/figma-security-fix/',
    '<rootDir>/.git/',
  ],
  
  // Allow transformation of ES modules from node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$|@modelcontextprotocol/))',
  ],
  
  // Test timeout (increased for potentially slow tests)
  testTimeout: 10000,
  
  // Performance optimizations
  maxWorkers: '50%',
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  
  // Enhanced error reporting
  verbose: true,
  errorOnDeprecated: true,
};
