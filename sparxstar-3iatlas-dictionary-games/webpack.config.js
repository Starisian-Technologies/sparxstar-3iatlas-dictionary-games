const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    mode: 'production',
    devtool: 'source-map',
    entry: {
        'rlc-games': './src/index.jsx',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'js/[name].min.js',
        library: {
            name: 'RlcGames',
            type: 'umd',
        },
        clean: true,
    },
    externals: {
        react: 'React',
        'react-dom': 'ReactDOM',
    },
    resolve: {
        mainFields: ['browser', 'module', 'main'],
        extensions: ['.mjs', '.js', '.jsx', '.json'],
    },
    module: {
        rules: [
            {
                test: /\.js$/,
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
                        cacheDirectory: false,
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
    },
    plugins: [
        new MiniCssExtractPlugin({ filename: 'css/[name].min.css' }),
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify('production'),
        }),
    ],
};
