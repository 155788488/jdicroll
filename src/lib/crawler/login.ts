import { Page } from 'playwright';

interface Credential {
  login_type: string;
  email?: string;
  password?: string;
  cookies?: string;
}

export async function loginToArmageddon(page: Page, credential: Credential): Promise<boolean> {
  try {
    // If we have stored cookies, try restoring them first
    if (credential.cookies) {
      const cookies = JSON.parse(credential.cookies);
      await page.context().addCookies(cookies);
      await page.goto('https://amag-class.kr/Class');

      // Check if already logged in
      const isLoggedIn = await page.evaluate(() => {
        return !document.querySelector('a[href*="login"], button:has-text("로그인")');
      });
      if (isLoggedIn) return true;
    }

    // Navigate to login page
    await page.goto('https://amag-class.kr');
    await page.click('text=로그인').catch(() => {});
    await page.waitForTimeout(2000);

    // Try Kakao login
    const kakaoButton = page.locator('text=카카오로 3초만에 시작하기').first();
    if (await kakaoButton.isVisible()) {
      await kakaoButton.click();
      await page.waitForTimeout(3000);

      // If Kakao login form appears, fill credentials
      if (credential.email && credential.password) {
        const emailInput = page.locator('input[name="loginId"], input[name="email"], #loginId');
        if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await emailInput.fill(credential.email);
          await page.locator('input[name="password"], #password').fill(credential.password);
          await page.locator('button[type="submit"], .submit').first().click();
          await page.waitForTimeout(3000);
        }
      }

      // Wait for redirect back
      await page.waitForURL('**/amag-class.kr/**', { timeout: 15000 }).catch(() => {});
    }

    // Save cookies for next time
    const cookies = await page.context().cookies();
    // Return cookies to be saved to Supabase
    (page as any).__newCookies = JSON.stringify(cookies);

    return true;
  } catch (error) {
    console.error('Armageddon login failed:', error);
    return false;
  }
}

export async function loginToPlatform(page: Page, platformId: string, credential: Credential): Promise<boolean> {
  switch (platformId) {
    case 'armageddon':
      return loginToArmageddon(page, credential);
    default:
      // Most platforms don't require login
      return true;
  }
}
