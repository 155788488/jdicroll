import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { url, instructor, platform } = await req.json();

    if (!url) {
      return NextResponse.json({ success: false, error: 'URL을 입력해주세요' }, { status: 400 });
    }

    // Detect platform from URL
    const detectedPlatform = detectPlatform(url);
    const finalPlatform = platform || detectedPlatform;

    if (!finalPlatform) {
      return NextResponse.json({ success: false, error: '지원하지 않는 플랫폼입니다' }, { status: 400 });
    }

    // Import crawler dynamically
    const { withPage } = await import('@/lib/crawler/browser');
    const { extractEnrollment } = await import('@/lib/crawler/extractors');

    const today = getTodayKST();

    const results = await withPage(async (page) => {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const courseIdMatch = url.match(/\/courses\/([a-zA-Z0-9_-]+)/);
      const courseId = courseIdMatch ? courseIdMatch[1] : '';

      const pageTitle = await page.title();
      const courseTitle = pageTitle.replace(/ \| .*$/, '').trim() || url;

      // 오늘 이미 조회한 강의인지 확인 (단일 옵션 기준)
      const { data: existing } = await supabaseAdmin
        .from('crawl_results')
        .select('*')
        .eq('crawl_date', today)
        .eq('platform', finalPlatform)
        .ilike('course_title', `${courseTitle}%`)
        .limit(1);

      if (existing && existing.length > 0) {
        // 오늘 이미 조회된 결과 — 캐시 반환
        const cached = existing[0];
        return {
          alreadyCrawled: true,
          results: [{
            platform: cached.platform,
            instructor: cached.instructor,
            courseTitle: cached.course_title,
            optionName: cached.option_name,
            enrollmentCount: cached.enrollment_count,
            price: cached.price,
            estimatedRevenue: cached.estimated_revenue,
            status: cached.status,
          }],
        };
      }

      const method = getExtractionMethod(finalPlatform);
      const extractedOptions = await extractEnrollment(page, method, courseId);

      return {
        alreadyCrawled: false,
        results: extractedOptions.map(opt => ({
          platform: finalPlatform,
          instructor: instructor || '미입력',
          courseTitle,
          optionName: opt.optionName,
          enrollmentCount: opt.enrollmentCount,
          price: opt.price,
          estimatedRevenue: opt.enrollmentCount && opt.price
            ? opt.enrollmentCount * opt.price
            : null,
          status: opt.enrollmentCount !== null ? 'success' : 'failed',
        })),
      };
    });

    // 이미 조회된 결과면 저장·노션 업로드 스킵
    if (!results.alreadyCrawled) {
      for (const r of results.results) {
        const storageTitle = results.results.length > 1
          ? `${r.courseTitle} - ${r.optionName}`
          : r.courseTitle;

        await supabaseAdmin
          .from('crawl_results')
          .upsert({
            crawl_date: today,
            platform: r.platform,
            instructor: r.instructor,
            course_title: storageTitle,
            enrollment_count: r.enrollmentCount,
            price: r.price,
            option_name: r.optionName,
            estimated_revenue: r.estimatedRevenue,
            status: r.status,
          }, { onConflict: 'crawl_date,platform,course_title' });
      }

      const successResults = results.results.filter(r => r.status === 'success');
      if (process.env.NOTION_API_KEY && successResults.length > 0) {
        const { writeReport } = await import('@/lib/notion');
        await writeReport(successResults.map(r => ({
          instructor: r.instructor,
          courseTitle: r.courseTitle,
          platform: r.platform,
          date: today,
          optionName: r.optionName || '',
          optionPrice: r.price || 0,
          enrollmentCount: r.enrollmentCount || 0,
        })));
      }
    }

    const totalEnrollments = results.results.reduce((s, r) => s + (r.enrollmentCount || 0), 0);
    const totalRevenue = results.results.reduce((s, r) => s + (r.estimatedRevenue || 0), 0);
    const hasSuccess = results.results.some(r => r.status === 'success');

    return NextResponse.json({
      success: true,
      alreadyCrawled: results.alreadyCrawled,
      result: {
        ...results.results[0],
        enrollmentCount: totalEnrollments,
        estimatedRevenue: totalRevenue,
        status: hasSuccess ? 'success' : 'failed',
        optionCount: results.results.length,
      },
      options: results.results,
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

function detectPlatform(url: string): string | null {
  if (url.includes('titanclass')) return '타이탄클래스';
  if (url.includes('harvardclass')) return '하버드클래스';
  if (url.includes('cojooboo')) return '코주부클래스';
  if (url.includes('ivyclass')) return '아이비클래스';
  if (url.includes('invader')) return '인베이더스쿨';
  if (url.includes('nlab')) return 'N잡연구소';
  if (url.includes('amag-class')) return '아마겟돈클래스';
  if (url.includes('moneyup')) return '머니업클래스';
  if (url.includes('buup')) return '부업의정석';
  if (url.includes('fitcnic')) return '핏크닉';
  return null;
}

function getExtractionMethod(platform: string): string {
  if (platform === '타이탄클래스') return 'trpc';
  if (platform === '아마겟돈클래스') return 'login-required';
  return 'rsc-fetch'; // 하버드 포함 모든 플랫폼 rsc-fetch로 통일
}

function getTodayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}
