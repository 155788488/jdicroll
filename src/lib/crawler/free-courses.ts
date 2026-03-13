import { Page } from 'playwright';
import { withPage } from './browser';

export interface FreeCourse {
  platform: string;
  instructor: string;
  courseTitle: string;
  date: string | null;
  isDatetime: boolean;
  url: string;
}

interface PlatformConfig {
  name: string;
  listUrl: string;
  selector: string;
  urlFilter: ((u: string) => boolean) | null;
}

const PLATFORMS: PlatformConfig[] = [
  { name: '머니업클래스', listUrl: 'https://www.moneyupclass.com/free-courses', selector: 'a[href*="/courses/"]', urlFilter: (u: string) => /\/courses\/[0-9a-f-]{36}/.test(u) },
  { name: '타이탄클래스', listUrl: 'https://www.titanclass.co.kr/free-courses', selector: 'a[href*="/free-courses/"]', urlFilter: null },
  { name: '핏크닉', listUrl: 'https://www.fitchnic.com/free-courses', selector: 'a[href*="/courses/"]', urlFilter: null },
  { name: '아이비클래스', listUrl: 'https://www.ivyclass.co.kr/courses', selector: 'a[href*="/free-courses/"]', urlFilter: null },
  { name: '인베이더스쿨', listUrl: 'https://www.invader.co.kr/courses?courseType=FREE', selector: 'a[href*="/free-courses/"]', urlFilter: null },
  { name: '코주부클래스', listUrl: 'https://www.cojooboo.co.kr/courses?courseType=FREE', selector: 'a[href*="/free-courses/"]', urlFilter: null },
  { name: '하버드클래스', listUrl: 'https://harvardclass.co.kr/free-courses', selector: 'a[href*="/free-courses/"]', urlFilter: null },
  { name: 'N잡연구소', listUrl: 'https://www.nlab.kr/courses', selector: 'a[href*="/free-courses/"]', urlFilter: null },
  { name: '아마겟돈클래스', listUrl: 'https://amag-class.kr/Free-Class', selector: 'a[href*="lectureId="]', urlFilter: null },
];

async function collectUrls(page: Page, platform: PlatformConfig): Promise<string[]> {
  await page.goto(platform.listUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const hrefs = await page.evaluate((selector: string) => {
    const links = document.querySelectorAll(selector);
    return Array.from(links).map(a => (a as HTMLAnchorElement).href);
  }, platform.selector);

  let urls = [...new Set(hrefs)];

  if (platform.urlFilter) {
    urls = urls.filter(platform.urlFilter);
  }

  return urls;
}

// 강사 추출: [강사명] 패턴 (타이탄클래스, N잡연구소 등)
function extractInstructorFromBrackets(title: string): string {
  const match = title.match(/\[([^\]]+)\]/);
  return match ? match[1] : '';
}

// 강사 추출: 아이비클래스/코주부클래스 - (날짜_강사명) 패턴
function extractInstructorFromParens(title: string): string {
  const match = title.match(/\([^)]*_([^)]+)\)/);
  return match ? match[1] : '';
}

// HTML 소스에서 Next.js JSON 데이터로 강사/날짜 추출 (공통)
async function extractFromHtmlJson(page: Page): Promise<{ instructor: string; date: string | null; isDatetime: boolean }> {
  const html = await page.content();

  // 강사명 추출: teachers 배열
  let instructor = '';
  const teachersMatch = html.match(/"teachers"\s*:\s*\[[\s\S]*?"name"\s*:\s*"([^"]+)"/);
  if (teachersMatch) {
    instructor = teachersMatch[1];
  }
  // 단일 teacher 필드 (하버드클래스)
  if (!instructor) {
    const teacherMatch = html.match(/"teacher"\s*:\s*"([^"]+)"/);
    if (teacherMatch) instructor = teacherMatch[1];
  }

  // 날짜 추출: startDate 우선, endDate 차선
  let date: string | null = null;
  let isDatetime = false;

  const startDateMatch = html.match(/"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  const endDateMatch = html.match(/"endDate"\s*:\s*"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);

  const isoDate = startDateMatch?.[1] || endDateMatch?.[1];
  if (isoDate) {
    date = isoDate + '.000Z';
    isDatetime = true;
  }

  return { instructor, date, isDatetime };
}

// 날짜/시간 추출 from 텍스트
function extractDatetime(text: string): { date: string | null; isDatetime: boolean } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  let year: string | null = null;
  let month: string | null = null;
  let day: string | null = null;

  // 우선순위대로 날짜 패턴 시도
  const fullDateMatch = text.match(/(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
  if (fullDateMatch) {
    year = fullDateMatch[1];
    month = fullDateMatch[2].padStart(2, '0');
    day = fullDateMatch[3].padStart(2, '0');
  } else {
    const korFullMatch = text.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (korFullMatch) {
      year = korFullMatch[1];
      month = korFullMatch[2].padStart(2, '0');
      day = korFullMatch[3].padStart(2, '0');
    } else {
      // M/D (요일) 형식 - 타이탄클래스 (예: 3/19 (목))
      const slashDateMatch = text.match(/(\d{1,2})\/(\d{1,2})\s*(?:\([가-힣]\))?/);
      if (slashDateMatch) {
        year = kst.getFullYear().toString();
        month = slashDateMatch[1].padStart(2, '0');
        day = slashDateMatch[2].padStart(2, '0');
      } else {
        const korMatch = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
        if (korMatch) {
          year = kst.getFullYear().toString();
          month = korMatch[1].padStart(2, '0');
          day = korMatch[2].padStart(2, '0');
        }
      }
    }
  }

  if (!year || !month || !day) {
    return { date: null, isDatetime: false };
  }

  // 시간 추출
  const timePatterns = [
    /(\d{1,2})\s*:\s*(\d{2})/,
    /오후\s*(\d{1,2})\s*시\s*(\d{0,2})/,
    /오전\s*(\d{1,2})\s*시\s*(\d{0,2})/,
    /(\d{1,2})\s*시\s*(\d{0,2})\s*분?/,
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = parseInt(match[2] || '0');

      if (text.includes('오후') && hours < 12) {
        hours += 12;
      } else if (text.includes('오전') && hours === 12) {
        hours = 0;
      }

      const kstDate = new Date(`${year}-${month}-${day}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00+09:00`);
      return {
        date: kstDate.toISOString(),
        isDatetime: true,
      };
    }
  }

  return { date: `${year}-${month}-${day}`, isDatetime: false };
}

async function extractCourseDetail(page: Page, url: string, platformName: string): Promise<Omit<FreeCourse, 'platform' | 'url'>> {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 1. HTML JSON 추출 (타이탄/아마겟돈 계열 포함 공통)
  const jsonData = await extractFromHtmlJson(page);

  // 3. 제목 추출 (여러 h1 중 가장 긴 것 선택 — sr-only 등 짧은 숨김 h1 무시)
  const title = await page.evaluate(() => {
    const h1s = Array.from(document.querySelectorAll('h1'));
    const best = h1s
      .map(el => el.textContent?.trim() || '')
      .reduce((a, b) => b.length > a.length ? b : a, '');
    if (best.length >= 5) return best;
    return document.title.replace(/ \| .*$/, '').trim();
  });

  // 4. 강사 추출 (JSON 우선 → 플랫폼별 폴백)
  let instructor = jsonData.instructor;

  if (!instructor) {
    switch (platformName) {
      case '타이탄클래스':
      case '아마겟돈클래스':
      case 'N잡연구소':
        instructor = extractInstructorFromBrackets(title);
        break;
      case '아이비클래스':
      case '코주부클래스':
        instructor = extractInstructorFromParens(title);
        if (!instructor) {
          instructor = await page.evaluate(() => {
            const candidates = document.querySelectorAll('[class*="instructor"], [class*="Instructor"], [class*="teacher"], [class*="Teacher"], [class*="author"], [class*="Author"]');
            for (const el of candidates) {
              const text = el.textContent?.trim();
              if (text && text.length < 30) return text;
            }
            return '';
          });
        }
        break;
      default:
        // 인베이더스쿨, 하버드클래스, 머니업클래스, 핏크닉 등
        instructor = await page.evaluate(() => {
          const candidates = document.querySelectorAll('[class*="instructor"], [class*="Instructor"], [class*="teacher"], [class*="Teacher"], [class*="author"], [class*="Author"]');
          for (const el of candidates) {
            const text = el.textContent?.trim();
            if (text && text.length > 0 && text.length < 30) return text;
          }
          const h1 = document.querySelector('h1');
          if (h1) {
            const next = h1.nextElementSibling;
            if (next && next.textContent && next.textContent.trim().length < 30) {
              return next.textContent.trim();
            }
          }
          return '';
        });
    }
  }

  // 5. 날짜 추출 (JSON 우선 → 텍스트 패턴 폴백)
  let date = jsonData.date;
  let isDatetime = jsonData.isDatetime;

  if (!date) {
    const pageText = await page.evaluate(() => document.body.innerText || '');
    const result = extractDatetime(pageText);
    date = result.date;
    isDatetime = result.isDatetime;
  }

  return {
    instructor,
    courseTitle: title,
    date,
    isDatetime,
  };
}

export type ProgressCallback = (msg: string) => void;

async function crawlPlatform(platform: PlatformConfig, onProgress?: ProgressCallback): Promise<FreeCourse[]> {
  onProgress?.(`🔎 [${platform.name}] 목록 페이지 접속 중...`);

  let urls: string[];
  try {
    urls = await withPage(async (page) => {
      return collectUrls(page, platform);
    });
  } catch (error) {
    onProgress?.(`❌ [${platform.name}] 목록 수집 실패: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }

  onProgress?.(`📋 [${platform.name}] ${urls.length}개 강의 발견`);

  const courses: FreeCourse[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const detail = await withPage(async (page) => {
        return extractCourseDetail(page, url, platform.name);
      });
      courses.push({ platform: platform.name, url, ...detail });
      onProgress?.(`  ✅ [${platform.name}] (${i + 1}/${urls.length}) ${detail.courseTitle || url}`);
    } catch (error) {
      onProgress?.(`  ⚠️ [${platform.name}] (${i + 1}/${urls.length}) 상세 추출 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  onProgress?.(`✔️ [${platform.name}] 완료 — ${courses.length}개 수집`);
  return courses;
}

export async function crawlFreeCourses(onProgress?: ProgressCallback): Promise<FreeCourse[]> {
  const allCourses: FreeCourse[] = [];

  for (const platform of PLATFORMS) {
    try {
      const courses = await crawlPlatform(platform, onProgress);
      allCourses.push(...courses);
    } catch (error) {
      onProgress?.(`❌ [${platform.name}] 전체 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  onProgress?.(`🏁 크롤링 완료 — 총 ${allCourses.length}개 수집`);
  return allCourses;
}
