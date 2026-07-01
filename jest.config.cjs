/* Jest config — jsdom for the React components; CSS imports stubbed. */
module.exports = {
    testEnvironment: 'jsdom',
    moduleNameMapper: {
        '\\.(css|less|scss)$': '<rootDir>/__mocks__/styleMock.cjs',
    },
    testMatch: ['**/__tests__/**/*.{js,jsx}', '**/*.test.{js,jsx}'],
};
