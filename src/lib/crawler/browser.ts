import { chromium, Browser, BrowserContext, Page } from 'playwright';

let browser: Browser | null = null;

const BASE_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
];

async function launchBrowser(): Promise<Browser> {
  // Windows 로컬 환경에서는 설치된 Chrome/Edge 사용 시도
  if (process.platform === 'win32') {
    // 1) 시스템 Chrome 시도
    try {
      return await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: BASE_ARGS,
      });
    } catch {}

    // 2) Edge 시도
    try {
      return await chromium.launch({
        channel: 'msedge',
        headless: true,
        args: BASE_ARGS,
      });
    } catch {}
  }

  // Linux/Railway 또는 폴백: 번들 chromium
  return await chromium.launch({
    headless: true,
    args: BASE_ARGS,
  });
}

export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await launchBrowser();
  }
  return browser;
}

export async function createContext(): Promise<BrowserContext> {
  const b = await getBrowser();
  return b.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await createContext();
  const page = await context.newPage();
  try {
    return await fn(page);
  } finally {
    await context.close();
  }
}
