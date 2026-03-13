import { Page } from 'playwright';
import { withPage, closeBrowser } from './browser';
import { extractEnrollment } from './extractors';
import { loginToPlatform } from './login';
import { getCredential, saveCredential } from '../supabase';
import { PLATFORMS, CrawlResultData } from '../types';

interface CrawlTarget {
  platform: string;
  instructor: string;
  courseTitle: string;
}

async function findCourseOnPlatform(page: Page, coursesUrl: string, instructor: string): Promise<{ courseId: string; courseUrl: string } | null> {
  await page.goto(coursesUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Look for course card matching instructor name
  const courseLink = await page.evaluate((name) => {
    const allElements = document.querySelectorAll('a[href*="/courses/"]');
    for (const el of allElements) {
      const text = el.textContent || '';
      if (text.includes(name)) {
        return (el as HTMLAnchorElement).href;
      }
    }

    // Try broader search in cards
    const cards = document.querySelectorAll('[class*="card"], [class*="Card"], [class*="course"], [class*="Course"]');
    for (const card of cards) {
      const text = card.textContent || '';
      if (text.includes(name)) {
        const link = card.querySelector('a[href*="/courses/"]') as HTMLAnchorElement;
        if (link) return link.href;
        const parentLink = card.closest('a[href*="/courses/"]') as HTMLAnchorElement;
        if (parentLink) return parentLink.href;
      }
    }
    return null;
  }, instructor);

  if (!courseLink) return null;

  // Extract course ID from URL
  const courseIdMatch = courseLink.match(/\/courses\/([a-f0-9-]+)/);
  const courseId = courseIdMatch ? courseIdMatch[1] : courseLink.split('/courses/')[1]?.split(/[?#]/)[0] || '';

  return { courseId, courseUrl: courseLink };
}

export async function crawlPlatform(target: CrawlTarget): Promise<CrawlResultData> {
  const platform = PLATFORMS.find(p => p.name === target.platform || p.id === target.platform);
  if (!platform) {
    return {
      platform: target.platform,
      instructor: target.instructor,
      courseTitle: target.courseTitle,
      enrollmentCount: null,
      price: null,
      optionName: '',
      estimatedRevenue: null,
      status: 'failed',
      errorMessage: `Unknown platform: ${target.platform}`,
    };
  }

  try {
    return await withPage(async (page) => {
      // Handle login if required
      if (platform.requiresLogin) {
        const credential = await getCredential(platform.id);
        if (!credential) {
          return {
            platform: platform.name,
            instructor: target.instructor,
            courseTitle: target.courseTitle,
            enrollmentCount: null,
            price: null,
            optionName: '',
            estimatedRevenue: null,
            status: 'failed',
            errorMessage: `No credentials found for ${platform.name}. Please add credentials in settings.`,
          };
        }
        const loggedIn = await loginToPlatform(page, platform.id, credential);
        if (!loggedIn) {
          return {
            platform: platform.name,
            instructor: target.instructor,
            courseTitle: target.courseTitle,
            enrollmentCount: null,
            price: null,
            optionName: '',
            estimatedRevenue: null,
            status: 'failed',
            errorMessage: `Login failed for ${platform.name}`,
          };
        }

        // Save updated cookies
        const newCookies = (page as any).__newCookies;
        if (newCookies) {
          await saveCredential({
            platform: platform.id,
            login_type: credential.login_type,
            email: credential.email,
            password: credential.password,
            cookies: newCookies,
          });
        }
      }

      // Find the course
      const course = await findCourseOnPlatform(page, platform.coursesUrl, target.instructor);
      if (!course) {
        return {
          platform: platform.name,
          instructor: target.instructor,
          courseTitle: target.courseTitle,
          enrollmentCount: null,
          price: null,
          optionName: '',
          estimatedRevenue: null,
          status: 'failed',
          errorMessage: `Course not found for instructor: ${target.instructor}`,
        };
      }

      // Navigate to course detail
      await page.goto(course.courseUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Extract enrollment data (배열 반환)
      const options = await extractEnrollment(page, platform.extractionMethod, course.courseId);
      const first = options[0];

      const estimatedRevenue = (first.enrollmentCount && first.price)
        ? first.enrollmentCount * first.price
        : null;

      return {
        platform: platform.name,
        instructor: target.instructor,
        courseTitle: target.courseTitle,
        enrollmentCount: first.enrollmentCount,
        price: first.price,
        optionName: first.optionName,
        estimatedRevenue,
        status: first.enrollmentCount !== null ? 'success' : 'failed',
        errorMessage: first.enrollmentCount === null ? 'Failed to extract enrollment data' : undefined,
      };
    });
  } catch (error) {
    return {
      platform: target.platform,
      instructor: target.instructor,
      courseTitle: target.courseTitle,
      enrollmentCount: null,
      price: null,
      optionName: '',
      estimatedRevenue: null,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function crawlAll(targets: CrawlTarget[]): Promise<CrawlResultData[]> {
  const results: CrawlResultData[] = [];

  // Process platforms sequentially to avoid overwhelming servers
  for (const target of targets) {
    console.log(`Crawling ${target.platform} - ${target.instructor}...`);
    const result = await crawlPlatform(target);
    results.push(result);
    console.log(`  Result: ${result.status} - ${result.enrollmentCount ?? 'N/A'} enrollments`);
  }

  await closeBrowser();
  return results;
}

export { closeBrowser };
