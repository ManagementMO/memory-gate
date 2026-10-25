import { chromium } from '@playwright/test';
/** Keep the scene's regression suite runnable on the team's Windows and macOS laptops. */
export function launchBrowser() {
  return chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : process.platform === 'darwin' ? { channel: 'chrome' } : {}),
    args: ['--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-webgl'] : process.platform === 'darwin' ? ['--use-angle=metal'] : [])],
  });
}
