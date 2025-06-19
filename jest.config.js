module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  testMatch: ['**/*.test.js', '**/*.spec.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js'],
};
