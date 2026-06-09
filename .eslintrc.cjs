'use strict';

module.exports = {
    root: true,
    env: {
        browser: true,
        es2022: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true,
        },
    },
    plugins: ['react', 'react-hooks'],
    settings: {
        react: {
            version: '18',
        },
    },
    rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        'no-console': 'warn',
        'react/prop-types': 'off',
        'react/react-in-jsx-scope': 'off',
    },
};
