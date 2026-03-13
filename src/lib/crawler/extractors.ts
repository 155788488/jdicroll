import { Page } from 'playwright';

export interface ExtractionResult {
  enrollmentCount: number | null;
  price: number | null;
  optionName: string;
}

// Method 1: tRPC API (타이탄클래스) - 다중 옵션 지원
export async function extractViaTrpc(page: Page, courseId: string): Promise<ExtractionResult[]> {
  const input = encodeURIComponent(JSON.stringify({ "0": { json: { courseId } } }));
  const response = await page.evaluate(async (inp) => {
    const res = await fetch(`/api/trpc/frontCourse.getCourse?batch=1&input=${inp}`);
    return res.text();
  }, input);

  // 여러 옵션 파싱 시도 (courseOptions 배열)
  try {
    const parsed = JSON.parse(response);
    const courseData = parsed?.[0]?.result?.data?.json ?? parsed?.[0]?.result?.data;
    const options = courseData?.courseOptions ?? courseData?.options ?? [];

    if (Array.isArray(options) && options.length > 1) {
      return options.map((opt: any) => ({
        optionName: opt.name ?? opt.title ?? opt.optionName ?? '옵션',
        enrollmentCount: opt.enrollmentCount ?? opt.enrollment ?? null,
        price: opt.discountedPrice ?? opt.price ?? null,
      }));
    }

    // 단일 옵션
    const enrollMatch = response.match(/"enrollmentCount"\s*:\s*(\d+)/);
    const priceMatch = response.match(/"discountedPrice"\s*:\s*(\d+)/);
    const origPriceMatch = response.match(/"originalPrice"\s*:\s*(\d+)/);
    return [{
      enrollmentCount: enrollMatch ? parseInt(enrollMatch[1]) : null,
      price: priceMatch ? parseInt(priceMatch[1]) : (origPriceMatch ? parseInt(origPriceMatch[1]) : null),
      optionName: '얼리버드',
    }];
  } catch {
    const enrollMatch = response.match(/"enrollmentCount"\s*:\s*(\d+)/);
    const priceMatch = response.match(/"discountedPrice"\s*:\s*(\d+)/);
    const origPriceMatch = response.match(/"originalPrice"\s*:\s*(\d+)/);
    return [{
      enrollmentCount: enrollMatch ? parseInt(enrollMatch[1]) : null,
      price: priceMatch ? parseInt(priceMatch[1]) : (origPriceMatch ? parseInt(origPriceMatch[1]) : null),
      optionName: '얼리버드',
    }];
  }
}

// Method 2: RSC Script tag parsing (하버드클래스) - 다중 옵션 지원
export async function extractViaRscScript(page: Page): Promise<ExtractionResult[]> {
  const result = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script');
    let fullText = '';
    scripts.forEach(s => {
      const text = s.textContent || s.innerText;
      if (text && (text.includes('enrollments') || text.includes('enrollcount') || text.includes('userProfileId'))) {
        fullText += text;
      }
    });

    // 다중 옵션 파싱 시도
    const optionsMatch = fullText.match(/"courseOptions"\s*:\s*(\[[\s\S]*?\])/)
      ?? fullText.match(/"options"\s*:\s*(\[[\s\S]*?\])/);
    if (optionsMatch) {
      try {
        const opts = JSON.parse(optionsMatch[1]);
        if (Array.isArray(opts) && opts.length > 1) {
          return { type: 'multi', options: opts };
        }
      } catch {}
    }

    // Harvard style: count unique userProfileIds (단일 옵션 폴백)
    const profileMatches = fullText.match(/userProfileId.*?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g) || [];
    const uniqueIds: Record<string, boolean> = {};
    profileMatches.forEach(m => {
      const idMatch = m.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
      if (idMatch) uniqueIds[idMatch[1]] = true;
    });
    const harvardCount = Object.keys(uniqueIds).length;
    const enrollMatch = fullText.match(/"enrollments"\s*:\s*(\d+)/);
    const enrollCountMatch = fullText.match(/"enrollmentCount"\s*:\s*(\d+)/);
    return {
      type: 'single',
      harvardCount,
      directCount: enrollMatch ? parseInt(enrollMatch[1]) : (enrollCountMatch ? parseInt(enrollCountMatch[1]) : null),
    };
  });

  if ((result as any).type === 'multi') {
    const opts = (result as any).options;
    return opts.map((opt: any) => ({
      optionName: opt.name ?? opt.title ?? opt.optionName ?? '옵션',
      enrollmentCount: opt.enrollmentCount ?? opt.enrollment ?? opt.enrollcount?.length ?? null,
      price: opt.discountedPrice ?? opt.price ?? null,
    }));
  }

  const count = (result as any).harvardCount > 0 ? (result as any).harvardCount : (result as any).directCount;
  const price = await page.evaluate(() => {
    const priceEl = document.querySelector('[class*="price"], [class*="Price"]');
    if (priceEl) {
      const text = priceEl.textContent || '';
      const match = text.replace(/,/g, '').match(/(\d{4,})/);
      return match ? parseInt(match[1]) : null;
    }
    return null;
  });
  return [{ enrollmentCount: count, price, optionName: '얼리버드' }];
}

// Method 3: RSC Fetch (코주부, 아이비, 인베이더, N잡연구소 등) - 다중 옵션 지원
export async function extractViaRscFetch(page: Page, courseId: string): Promise<ExtractionResult[]> {
  const result = await page.evaluate(async (cid) => {
    try {
      const res = await fetch(`/courses/${cid}`, {
        headers: {
          'RSC': '1',
          'Next-Router-State-Tree': JSON.stringify([
            '', { children: ['courses', { children: [['id', cid, 'd'], { children: ['__PAGE__', {}] }] }] }, null, null, true
          ]),
        },
      });
      const text = await res.text();

      // enrollments 배열에서 courseOptionId별 집계 (하버드 방식)
      const enrollCountByOption: Record<string, number> = {};
      const enrollArrStart2 = text.indexOf('"enrollments":[');
      if (enrollArrStart2 !== -1) {
        const arrStart2 = enrollArrStart2 + '"enrollments":'.length;
        let depth2 = 0, j = arrStart2, end2 = -1;
        for (; j < Math.min(text.length, arrStart2 + 500000); j++) {
          if (text[j] === '[' || text[j] === '{') depth2++;
          else if (text[j] === ']' || text[j] === '}') { depth2--; if (depth2 === 0) { end2 = j + 1; break; } }
        }
        if (end2 > arrStart2) {
          try {
            const enrollments = JSON.parse(text.slice(arrStart2, end2));
            if (Array.isArray(enrollments)) {
              for (const e of enrollments) {
                if (e.courseOptionId) {
                  enrollCountByOption[e.courseOptionId] = (enrollCountByOption[e.courseOptionId] || 0) + 1;
                }
              }
            }
          } catch {}
        }
      }

      // "options" 배열 파싱 - 괄호 카운팅 방식
      const optionsStart = text.indexOf('"options":[{');
      if (optionsStart !== -1) {
        const arrStart = optionsStart + '"options":'.length;
        let depth = 0, i = arrStart, end = -1;
        for (; i < Math.min(text.length, arrStart + 5000); i++) {
          if (text[i] === '[' || text[i] === '{') depth++;
          else if (text[i] === ']' || text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
        }
        if (end > arrStart) {
          try {
            const opts = JSON.parse(text.slice(arrStart, end));
            if (Array.isArray(opts) && opts.length >= 1) {
              return {
                type: 'multi',
                options: opts.map((opt: any) => ({
                  name: opt.name ?? opt.title ?? '옵션',
                  enrollmentCount: enrollCountByOption[opt.id] ?? opt._count?.enrollments ?? opt.enrollmentCount ?? opt.enrollments ?? null,
                  price: opt.discountedPrice ?? opt.originalPrice ?? opt.price ?? null,
                }))
              };
            }
          } catch {}
        }
      }

      // 단일 옵션 폴백
      const enrollMatch = text.match(/"enrollments"\s*:\s*(\d+)/);
      const enrollCountMatch = text.match(/"enrollmentCount"\s*:\s*(\d+)/);
      const priceMatch = text.match(/"discountedPrice"\s*:\s*(\d+)/) || text.match(/"price"\s*:\s*(\d+)/);
      return {
        type: 'single',
        enrollmentCount: enrollMatch ? parseInt(enrollMatch[1]) : (enrollCountMatch ? parseInt(enrollCountMatch[1]) : null),
        price: priceMatch ? parseInt(priceMatch[1]) : null,
      };
    } catch {
      return { type: 'single', enrollmentCount: null, price: null };
    }
  }, courseId);

  if ((result as any).type === 'multi') {
    return (result as any).options.map((opt: any) => ({
      optionName: opt.name,
      enrollmentCount: opt.enrollmentCount,
      price: opt.price,
    }));
  }

  return [{ enrollmentCount: (result as any).enrollmentCount, price: (result as any).price, optionName: '얼리버드' }];
}

// Method 4: Armageddon (login required)
export async function extractViaArmageddonApi(page: Page, classId: string): Promise<ExtractionResult[]> {
  const responsePromise = page.waitForResponse(
    res => res.url().includes('classDetail') && res.status() === 200,
    { timeout: 15000 }
  );
  await page.click('text=수강하기').catch(() => {});
  try {
    const response = await responsePromise;
    const data = await response.json();
    const memberCnt = data?.memberCnt ?? data?.data?.memberCnt ?? null;
    return [{ enrollmentCount: typeof memberCnt === 'number' ? memberCnt : null, price: null, optionName: '수강' }];
  } catch {
    return [{ enrollmentCount: null, price: null, optionName: '수강' }];
  }
}

// 메인 추출 함수 - 항상 배열 반환
export async function extractEnrollment(page: Page, method: string, courseId: string): Promise<ExtractionResult[]> {
  switch (method) {
    case 'trpc':
      try { return await extractViaTrpc(page, courseId); } catch {}
      return extractViaRscFetch(page, courseId);

    case 'rsc-script':
      return extractViaRscScript(page);

    case 'rsc-fetch':
      try { return await extractViaRscFetch(page, courseId); } catch {}
      return extractViaRscScript(page);

    case 'login-required':
      return extractViaArmageddonApi(page, courseId);

    default:
      try { return await extractViaTrpc(page, courseId); } catch {}
      try { return await extractViaRscFetch(page, courseId); } catch {}
      return extractViaRscScript(page);
  }
}
