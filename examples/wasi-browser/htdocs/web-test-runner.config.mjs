import { playwrightLauncher } from '@web/test-runner-playwright';

export default {
  rootDir: '.',
  files: ['test/**/*.test.js'],
  browsers: [
    playwrightLauncher({
      product: 'chromium',
      launchOptions: { headless: true },
    }),
  ],
  nodeResolve: true,
};
