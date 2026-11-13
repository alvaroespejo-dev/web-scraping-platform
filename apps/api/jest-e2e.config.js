const base = require('./jest.config.js');

module.exports = {
  ...base,
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testRegex: '.*\.e2e-spec\.ts$',
  testTimeout: 60000,
};
