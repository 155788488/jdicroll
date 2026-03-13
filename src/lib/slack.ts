import { WebClient } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const CHANNEL_ID = process.env.SLACK_CHANNEL_ID!;

export interface ReportData {
  date: string;
  results: {
    instructor: string;
    platform: string;
    courseTitle: string;
    enrollmentCount: number;
    estimatedRevenue: number;
  }[];
  totalRevenue: number;
  totalEnrollments: number;
}

export async function sendDailyReport(report: ReportData): Promise<void> {
  const lines = report.results.map(
    r => `  - [${r.instructor} / ${r.platform}] ${r.courseTitle} → *${r.enrollmentCount}건* 결제 완료 (예상 매출: ${r.estimatedRevenue.toLocaleString()}원)`
  );

  const message = [
    `📢 *[일일 강의 전환 리포트 완료]*`,
    `• 체크 일자: ${report.date}`,
    ``,
    `• 성과 요약:`,
    ...lines,
    ``,
    `• 💰 총 결제건수: *${report.totalEnrollments}건*`,
    `• 💰 총 예상 매출: *${report.totalRevenue.toLocaleString()}원*`,
    ``,
    `• 상세 내역은 노션 '강의 전환 리포트'에 업데이트되었습니다.`,
  ].join('\n');

  await slack.chat.postMessage({
    channel: CHANNEL_ID,
    text: message,
    mrkdwn: true,
  });
}

// ── 무료강의 모니터링 리포트 ──

const FREE_COURSE_CHANNEL_ID = 'C0AJ2LQ479U';

export async function sendFreeCourseReport(params: {
  newCourses: Array<{ platform: string; instructor: string; courseTitle: string; url: string }>;
  skippedCount: number;
  errorItems: Array<{ platform: string; error: string }>;
  executedAt: string;
}): Promise<void> {
  try {
    const newLines = params.newCourses.map(
      c => `• [${c.platform}] ${c.instructor} - ${c.courseTitle}`
    );

    const errorLines = params.errorItems.map(
      e => `• ${e.platform} - ${e.error}`
    );

    const message = [
      `📊 *타사 무료강의 모니터링 결과*`,
      `실행일시: ${params.executedAt}`,
      ``,
      `*✅ 새로 저장된 강의 (${params.newCourses.length}건)*`,
      ...(newLines.length > 0 ? newLines : ['• 없음']),
      ``,
      `*⏭️ 중복 건너뜀: ${params.skippedCount}건*`,
      ``,
      `*❌ 오류: ${params.errorItems.length}건*`,
      ...(errorLines.length > 0 ? errorLines : ['• 없음']),
    ].join('\n');

    await slack.chat.postMessage({
      channel: FREE_COURSE_CHANNEL_ID,
      text: message,
      mrkdwn: true,
    });
  } catch (error) {
    console.error('[슬랙] 무료강의 리포트 전송 실패:', error);
  }
}

// ── 유튜브 협찬 트래커 리포트 ──

const YOUTUBE_TRACKER_CHANNEL_ID = 'C0AJZ18BZKJ';

export async function sendYoutubeTrackerReport(params: {
  checkedCount: number;
  sponsoredVideos: Array<{
    platform: string;
    instructorName: string;
    lectureDate: string | null;
    channelName: string;
    videoTitle: string;
    videoId: string;
  }>;
  notionUpdated: string[];
  newInstructors: string[];
  unresolvable: string[];
  executedAt: string;
}): Promise<void> {
  try {
    const date = params.executedAt.split(' ')[0] || params.executedAt;

    // 플랫폼별 그룹핑
    const byPlatform = new Map<string, typeof params.sponsoredVideos>();
    for (const v of params.sponsoredVideos) {
      const list = byPlatform.get(v.platform) || [];
      list.push(v);
      byPlatform.set(v.platform, list);
    }

    const lines: string[] = [
      `📺 *유튜브 협찬 체크 리포트* | ${date}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🔍 체크 채널 *${params.checkedCount}개* · 협찬 영상 *${params.sponsoredVideos.length}개* 발견`,
      `━━━━━━━━━━━━━━━━━━━━`,
    ];

    let idx = 1;
    for (const [platform, videos] of byPlatform) {
      lines.push(``, `*[${platform}]*`, ``);
      for (const v of videos) {
        lines.push(
          `${idx}️⃣ *${v.instructorName}*`,
          `┗ ${v.videoTitle}`,
          `┗ 강의일시: ${v.lectureDate || '-'}`,
          `┗ 채널: ${v.channelName}`,
          `┗ 🎬 https://youtu.be/${v.videoId}`,
          ``
        );
        idx++;
      }
    }

    lines.push(
      `━━━━━━━━━━━━━━━━━━━━`,
      `✅ 노션 업데이트: ${params.notionUpdated.length > 0 ? params.notionUpdated.join(', ') : '없음'}`,
      `🆕 새 강사 발견: ${params.newInstructors.length > 0 ? params.newInstructors.join(', ') : '없음'}`,
      `⚠️ 판별 불가: ${params.unresolvable.length > 0 ? params.unresolvable.join(', ') : '없음'}`,
      `━━━━━━━━━━━━━━━━━━━━`
    );

    await slack.chat.postMessage({
      channel: YOUTUBE_TRACKER_CHANNEL_ID,
      text: lines.join('\n'),
      mrkdwn: true,
    });
  } catch (error) {
    console.error('[슬랙] 유튜브 트래커 리포트 전송 실패:', error);
  }
}
