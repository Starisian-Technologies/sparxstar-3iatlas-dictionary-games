'use strict';

module.exports = {
    testEnvironment: 'jsdom',
    transform: {
        '^.+\\.(js|jsx)$': 'babel-jest',
    },
    moduleNameMapper: {
        '\\.css$': '<rootDir>/__mocks__/styleMock.cjs',
    },
    testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
    coverageDirectory: 'coverage',
    collectCoverageFrom: ['src/**/*.{js,jsx}', '!src/**/*.d.ts'],
};
