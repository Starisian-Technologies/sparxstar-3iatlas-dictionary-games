/* ESLint config for the RLC Games package (browser React, ES modules). */
module.exports = {
    root: true,
    env: {
        browser: true,
        es2021: true,
        jest: true,
    },
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
    },
    settings: {
        react: { version: 'detect' },
    },
    extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
    plugins: ['react', 'react-hooks'],
    rules: {
        /* React 18 with the classic runtime — React is imported explicitly. */
        'react/react-in-jsx-scope': 'off',
        /* This package documents props with JSDoc, not prop-types. */
        'react/prop-types': 'off',
        /* Allow intentionally-unused args/vars prefixed with underscore. */
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
};
