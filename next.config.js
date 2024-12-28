/** @type {import("next").NextConfig} */
module.exports = {
  experimental: { appDir: true },
  webpack(config) {
    config.experiments = { ...config.experiments, topLevelAwait: true };
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': '.',
      '@components': './components',
      '@i18n': './i18n'
    };
    return config;
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
};
