/**
 * Claude Code Webpack Configuration
 *
 * Build configuration for bundling Claude Code CLI.
 * Handles development and production builds with optimization.
 *
 * Part of the 98% → 100% extraction phase
 */

const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = (env, argv) => {
  const isDevelopment = argv.mode === 'development';
  const isProduction = argv.mode === 'production';
  const isAnalyze = process.env.ANALYZE === 'true';

  return {
    // Entry points
    entry: {
      main: './src/index.js',
      cli: './src/cli/cli-entry.js',
      runtime: './src/runtime/runtime-initialization.js'
    },

    // Output configuration
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? '[name].[contenthash:8].js' : '[name].js',
      chunkFilename: isProduction ? '[name].[contenthash:8].chunk.js' : '[name].chunk.js',
      library: 'ClaudeCode',
      libraryTarget: 'commonjs2',
      clean: true
    },

    // Target Node.js
    target: 'node',

    // Node polyfills
    node: {
      __dirname: false,
      __filename: false,
      global: true
    },

    // Mode
    mode: isDevelopment ? 'development' : 'production',

    // Source maps
    devtool: isDevelopment ? 'eval-source-map' : 'source-map',

    // Module resolution
    resolve: {
      extensions: ['.js', '.json', '.node'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@tools': path.resolve(__dirname, 'src/tools'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@api': path.resolve(__dirname, 'src/api'),
        '@ui': path.resolve(__dirname, 'src/ui'),
        '@config': path.resolve(__dirname, 'src/config'),
        '@runtime': path.resolve(__dirname, 'src/runtime')
      },
      fallback: {
        // Node.js core modules
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        util: false,
        buffer: false,
        events: false,
        child_process: false
      }
    },

    // Module rules
    module: {
      rules: [
        // JavaScript
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', {
                  targets: { node: '18' },
                  modules: false
                }]
              ],
              plugins: [
                '@babel/plugin-proposal-class-properties',
                '@babel/plugin-proposal-optional-chaining',
                '@babel/plugin-proposal-nullish-coalescing-operator',
                '@babel/plugin-transform-runtime'
              ]
            }
          }
        },

        // JSON
        {
          test: /\.json$/,
          type: 'json'
        },

        // Native modules
        {
          test: /\.node$/,
          use: 'node-loader'
        }
      ]
    },

    // Plugins
    plugins: [
      // Define environment variables
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(argv.mode),
        'process.env.VERSION': JSON.stringify(require('./package.json').version),
        'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString())
      }),

      // Banner plugin
      new webpack.BannerPlugin({
        banner: '#!/usr/bin/env node',
        raw: true,
        entryOnly: true,
        include: /cli/
      }),

      // Progress plugin
      new webpack.ProgressPlugin({
        activeModules: true,
        entries: true,
        modules: true,
        modulesCount: 100,
        profile: false,
        dependencies: true,
        dependenciesCount: 10000,
        percentBy: 'entries'
      }),

      // Ignore moment locales
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/
      }),

      // Compression in production
      ...(isProduction ? [
        new CompressionPlugin({
          algorithm: 'gzip',
          test: /\.(js|json)$/,
          threshold: 10240,
          minRatio: 0.8
        })
      ] : []),

      // Bundle analyzer
      ...(isAnalyze ? [
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: 'bundle-report.html',
          openAnalyzer: false
        })
      ] : [])
    ],

    // Optimization
    optimization: {
      minimize: isProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            parse: {
              ecma: 2020
            },
            compress: {
              ecma: 2020,
              warnings: false,
              comparisons: false,
              inline: 2,
              drop_console: isProduction,
              drop_debugger: true,
              pure_funcs: isProduction ? ['console.log', 'console.debug'] : []
            },
            mangle: {
              safari10: true
            },
            output: {
              ecma: 2020,
              comments: false,
              ascii_only: true
            }
          },
          parallel: true,
          extractComments: false
        })
      ],

      runtimeChunk: 'single',

      splitChunks: {
        chunks: 'all',
        maxInitialRequests: Infinity,
        minSize: 0,
        cacheGroups: {
          // Vendor chunks
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            priority: 10,
            reuseExistingChunk: true
          },

          // Common chunks
          common: {
            minChunks: 2,
            priority: 5,
            reuseExistingChunk: true
          },

          // Tool chunks
          tools: {
            test: /[\\/]src[\\/]tools[\\/]/,
            name: 'tools',
            priority: 8,
            reuseExistingChunk: true
          },

          // UI chunks
          ui: {
            test: /[\\/]src[\\/]ui[\\/]/,
            name: 'ui',
            priority: 7,
            reuseExistingChunk: true
          },

          // Utils chunks
          utils: {
            test: /[\\/]src[\\/]utils[\\/]/,
            name: 'utils',
            priority: 6,
            reuseExistingChunk: true
          }
        }
      },

      // Module concatenation
      concatenateModules: true,

      // Side effects
      sideEffects: false,

      // Used exports
      usedExports: true,

      // Provide exports
      providedExports: true
    },

    // Performance hints
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 5000000,
      maxAssetSize: 5000000
    },

    // Stats
    stats: {
      colors: true,
      modules: false,
      children: false,
      chunks: false,
      chunkModules: false,
      entrypoints: true,
      env: true,
      errors: true,
      errorDetails: true,
      warnings: true,
      publicPath: true,
      timings: true,
      version: true,
      hash: true
    },

    // Externals - Don't bundle these
    externals: {
      // Native modules
      'node:fs': 'commonjs2 fs',
      'node:path': 'commonjs2 path',
      'node:os': 'commonjs2 os',
      'node:crypto': 'commonjs2 crypto',
      'node:stream': 'commonjs2 stream',
      'node:child_process': 'commonjs2 child_process',
      'node:http': 'commonjs2 http',
      'node:https': 'commonjs2 https',
      'node:zlib': 'commonjs2 zlib',
      'node:util': 'commonjs2 util',
      'node:buffer': 'commonjs2 buffer',
      'node:events': 'commonjs2 events',
      'node:url': 'commonjs2 url',
      'node:querystring': 'commonjs2 querystring',
      'node:net': 'commonjs2 net',
      'node:tls': 'commonjs2 tls',
      'node:cluster': 'commonjs2 cluster',
      'node:process': 'commonjs2 process',
      'node:v8': 'commonjs2 v8',
      'node:vm': 'commonjs2 vm',
      'node:worker_threads': 'commonjs2 worker_threads',
      'node:perf_hooks': 'commonjs2 perf_hooks',

      // Optional native dependencies
      'keytar': 'commonjs2 keytar',
      'electron': 'commonjs2 electron',
      'fsevents': 'commonjs2 fsevents',
      'bufferutil': 'commonjs2 bufferutil',
      'utf-8-validate': 'commonjs2 utf-8-validate'
    },

    // Watch options
    watchOptions: {
      ignored: /node_modules/,
      aggregateTimeout: 300,
      poll: 1000
    },

    // Cache
    cache: {
      type: 'filesystem',
      cacheDirectory: path.resolve(__dirname, '.cache'),
      buildDependencies: {
        config: [__filename]
      }
    },

    // Infrastructure logging
    infrastructureLogging: {
      level: 'warn'
    }
  };
};

// Export helper functions
module.exports.createDevelopmentConfig = () => module.exports(null, { mode: 'development' });
module.exports.createProductionConfig = () => module.exports(null, { mode: 'production' });