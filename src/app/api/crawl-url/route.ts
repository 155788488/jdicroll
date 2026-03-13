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

    const results = await withPage(async (page) => {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const courseIdMatch = url.match(/\/courses\/([a-zA-Z0-9_-]+)/);
      const courseId = courseIdMatch ? courseIdMatch[1] : '';

      const pageTitle = await page.title();
      const courseTitle = pageTitle
        .replace(/ \| .*$/, '')
        .trim() || url;

      const method = getExtractionMethod(finalPlatform);
      const extractedOptions = await extractEnrollment(page, method, courseId);

      return extractedOptions.map(opt => ({
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
      }));
    });

    // 옵션별로 각각 저장 (옵션명을 강의제목에 포함해서 unique 충돌 방지)
    const today = getTodayKST();
    for (const r of results) {
      const storageTitle = results.length > 1
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

    // 노션 강의 전환 리포트 업로드
    const successResults = results.filter(r => r.status === 'success');
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

    const totalEnrollments = results.reduce((s, r) => s + (r.enrollmentCount || 0), 0);
    const totalRevenue = results.reduce((s, r) => s + (r.estimatedRevenue || 0), 0);
    const hasSuccess = results.some(r => r.status === 'success');

    return NextResponse.json({
      success: true,
      result: {
        ...results[0],
        enrollmentCount: totalEnrollments,
        estimatedRevenue: totalRevenue,
        status: hasSuccess ? 'success' : 'failed',
        optionCount: results.length,
      },
      options: results,
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
