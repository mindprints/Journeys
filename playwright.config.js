// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    testMatch: '**/*.spec.js',
    use: {
        baseURL: 'http://localhost:3010',
        headless: true,
        browserName: 'chromium',
    },
    reporter: [['list']],
    workers: 1,
    timeout: 15000,
});
