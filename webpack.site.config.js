/**
 * Website build — the deployable games.sparxstar.com static site.
 *
 * This is a SECOND, independent target alongside `webpack.config.js`, which
 * still builds the reusable UMD package exactly as before. The two differ in
 * every way that matters and share no output:
 *
 *   |             | webpack.config.js        | webpack.site.config.js      |
 *   | entry       | src/index.jsx (exports)  | src/site/main.jsx (mounts)  |
 *   | output      | dist/                    | dist-site/                  |
 *   | react       | externals — host-provided| bundled                     |
 *   | html        | none                     | index.html from a template  |
 *   | filenames   | stable, .min.js          | content-hashed              |
 *
 * Keeping them separate is the point. Folding the site into the package build
 * would make `react` non-external and turn the UMD bundle into something no
 * host could mount, so the package boundary is preserved by having two configs
 * rather than one config with a mode flag.
 *
 * Content hashing is what lets Nginx serve `/assets/*` with a one-year
 * immutable cache: a changed file gets a new name, so a stale cached asset can
 * never be served for new content. `index.html` itself is the one file that
 * must NOT be cached that way — it is the map to the hashed names.
 */

const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const { resolveEndpoints } = require('./site-endpoints.cjs');

/**
 * Deployment endpoints, overridable at build time.
 *
 * Resolved by the shared `site-endpoints.cjs`, which the CSP generator reads
 * too — so the origins compiled into the bundle and the origins the Nginx
 * `connect-src` permits cannot disagree. It also validates them, failing the
 * build rather than emitting a bundle that would call a bad origin from a
 * deployed browser.
 *
 * All four are PUBLIC addresses, not secrets — they are visible in the browser
 * the moment the app makes its first request. No credential, key or token is
 * defined here or anywhere else in this build; the image that serves the
 * output has nothing in it worth stealing.
 */
const SITE_CONFIG = resolveEndpoints();

module.exports = {
    mode: 'production',
    /* Source maps are emitted but not referenced from the bundle, so a browser
     * never fetches one and they can be withheld from the served directory
     * while staying available for symbolicating a stack trace. */
    devtool: 'hidden-source-map',
    entry: {
        games: './src/site/main.jsx',
    },
    output: {
        path: path.resolve(__dirname, 'dist-site'),
        filename: 'assets/js/[name].[contenthash:12].js',
        chunkFilename: 'assets/js/[name].[contenthash:12].js',
        assetModuleFilename: 'assets/media/[name].[contenthash:12][ext]',
        publicPath: '/',
        clean: true,
    },
    resolve: {
        extensions: ['.mjs', '.js', '.jsx', '.json'],
    },
    module: {
        rules: [
            /*
             * package.json declares `"type": "commonjs"`, which makes webpack
             * treat a bare `.js` under src/ as CommonJS and then fail to parse
             * the `export` Babel leaves behind (`modules: false`). Marking these
             * `javascript/auto` restores ESM detection. The package build needs
             * the same rule for the same reason — see webpack.config.js.
             */
            {
                test: /\.(js|jsx)$/,
                include: path.resolve(__dirname, 'src'),
                type: 'javascript/auto',
            },
            {
                test: /\.mjs$/,
                include: /node_modules/,
                type: 'javascript/auto',
                resolve: { fullySpecified: false },
            },
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [['@babel/preset-env', { modules: false }], '@babel/preset-react'],
                        sourceType: 'unambiguous',
                    },
                },
            },
            {
                test: /\.css$/i,
                use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
            },
        ],
    },
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin({ extractComments: false }), new CssMinimizerPlugin()],
        /* Split React and friends into their own chunk: they change far less
         * often than app code, so a returning player re-downloads only what
         * actually changed. */
        splitChunks: {
            cacheGroups: {
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendor',
                    chunks: 'all',
                },
            },
        },
        /* The module→chunk map lives in its own tiny file so that adding a
         * module doesn't invalidate the vendor chunk's hash. */
        runtimeChunk: 'single',
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/site/index.html',
            filename: 'index.html',
            inject: 'body',
            scriptLoading: 'defer',
            minify: {
                collapseWhitespace: true,
                removeComments: true,
                minifyCSS: true,
            },
        }),
        new MiniCssExtractPlugin({
            filename: 'assets/css/[name].[contenthash:12].css',
            chunkFilename: 'assets/css/[name].[contenthash:12].css',
        }),
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify('production'),
            ...Object.fromEntries(
                Object.entries(SITE_CONFIG).map(([key, value]) => [
                    `process.env.${key}`,
                    JSON.stringify(value),
                ])
            ),
        }),
    ],
};
