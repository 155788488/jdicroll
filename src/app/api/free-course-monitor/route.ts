import { NextResponse } from 'next/server';

export const maxDuration = 300;

interface JobState {
  running: boolean;
  logs: string[];
  result: {
    newCount: number;
    skippedCount: number;
    errorCount: number;
    totalCrawled: number;
    newCourses: Array<{ platform: string; instructor: string; courseTitle: string; url: string }>;
    errorItems: Array<{ platform: string; error: string }>;
  } | null;
  error: string | null;
  startedAt: string | null;
}

// 서버 프로세스에 상태 보관 (페이지 이탈해도 유지)
const jobState: JobState = {
  running: false,
  logs: [],
  result: null,
  error: null,
  startedAt: null,
};

function getKSTNow(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('T', ' ').slice(0, 19) + ' KST';
}

// 현재 상태 조회
export async function GET() {
  return NextResponse.json(jobState);
}

// 모니터링 시작 (즉시 반환, 백그라운드 실행)
export async function POST() {
  if (jobState.running) {
    return NextResponse.json({ alreadyRunning: true, state: jobState });
  }

  jobState.running = true;
  jobState.logs = ['🚀 모니터링 시작...'];
  jobState.result = null;
  jobState.error = null;
  jobState.startedAt = new Date().toISOString();

  // fire and forget — 페이지 이탈해도 계속 실행됨
  runMonitoring();

  return NextResponse.json({ started: true });
}

async function runMonitoring() {
  const send = (line: string) => {
    jobState.logs.push(line);
  };

  try {
    const { crawlFreeCourses } = await import('@/lib/crawler/free-courses');
    const allCourses = await crawlFreeCourses(send);

    send('');
    send('📝 노션 중복 체크 및 저장 중...');

    const { checkFreeCourseExists, saveFreeCourse } = await import('@/lib/notion');
    const newCourses: Array<{ platform: string; instructor: string; courseTitle: string; url: string }> = [];
    let skippedCount = 0;
    const errorItems: Array<{ platform: string; error: string }> = [];

    for (const course of allCourses) {
      try {
        const exists = await checkFreeCourseExists(course.url);
        if (exists) {
          skippedCount++;
          send(`  ⏭️ 중복 — ${course.platform}: ${course.courseTitle}`);
          continue;
        }
        await saveFreeCourse(course);
        newCourses.push({
          platform: course.platform,
          instructor: course.instructor,
          courseTitle: course.courseTitle,
          url: course.url,
        });
        send(`  💾 저장 — ${course.platform}: ${course.courseTitle}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errorItems.push({ platform: course.platform, error: msg });
        send(`  ❌ 저장 실패 — ${course.platform}: ${msg}`);
      }
    }

    if (process.env.SLACK_BOT_TOKEN) {
      send('');
      send('📣 슬랙 보고 중...');
      const { sendFreeCourseReport } = await import('@/lib/slack');
      await sendFreeCourseReport({ newCourses, skippedCount, errorItems, executedAt: getKSTNow() });
      send('  ✅ 슬랙 전송 완료');
    }

    jobState.result = {
      newCount: newCourses.length,
      skippedCount,
      errorCount: errorItems.length,
      totalCrawled: allCourses.length,
      newCourses,
      errorItems,
    };
    send(`🏁 완료! 신규 ${newCourses.length}건 저장, 중복 ${skippedCount}건, 오류 ${errorItems.length}건`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    jobState.error = msg;
    send(`❌ 오류: ${msg}`);
  } finally {
    jobState.running = false;
  }
}
