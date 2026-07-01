/*
 * Tailwind config. The host application supplies the Tailwind runtime for the
 * mounted game shell; this config exists so the package can compile its own CSS
 * entry when built standalone, and to document the class sources. Dark variants
 * (dark:*) used across the game components rely on the `class` strategy.
 */
module.exports = {
    content: ['./src/**/*.{js,jsx}'],
    darkMode: 'class',
    theme: {
        extend: {},
    },
    plugins: [],
};
