/*
 * Babel config scoped to Jest. Webpack drives its own Babel transform through
 * babel-loader options (see webpack.config.js), so this file returns an empty
 * preset list outside the test environment to avoid double-configuring the
 * production build.
 */
module.exports = (api) => {
    const isTest = api.env('test');
    return {
        presets: isTest
            ? [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-react']
            : [],
    };
};
