/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { rootDir: '.', experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true, strict: true, target: 'ES2022', module: 'commonjs' } }] },
  testTimeout: 30000,
}
