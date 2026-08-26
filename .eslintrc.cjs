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
    overrides: [
        {
            /*
             * The website build's endpoint configuration. Every `process.env.*`
             * read here is replaced with a string literal by webpack's
             * DefinePlugin (webpack.site.config.js) before the code ever runs,
             * so `process` genuinely does not exist at runtime and declaring
             * the browser env is still correct. Declaring it readonly for this
             * one file keeps the rule on everywhere else, where a stray
             * `process` reference really would be a bug.
             */
            files: ['src/site/config.js'],
            globals: { process: 'readonly' },
        },
    ],
    rules: {
        /* React 18 with the classic runtime — React is imported explicitly. */
        'react/react-in-jsx-scope': 'off',
        /* This package documents props with JSDoc, not prop-types. */
        'react/prop-types': 'off',
        /* Allow intentionally-unused args/vars prefixed with underscore. */
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
};
