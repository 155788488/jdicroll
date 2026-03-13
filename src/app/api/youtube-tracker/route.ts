import { NextResponse } from 'next/server';

export const maxDuration = 300;

interface JobState {
  running: boolean;
  logs: string[];
  result: {
    checkedChannels: number;
    sponsoredCount: number;
    updatedCount: number;
    newInstructorCount: number;
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
  } | null;
  error: string | null;
  startedAt: string | null;
}

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

export async function GET() {
  return NextResponse.json(jobState);
}

export async function POST() {
  if (jobState.running) {
    return NextResponse.json({ alreadyRunning: true, state: jobState });
  }

  jobState.running = true;
  jobState.logs = ['🚀 유튜브 협찬 체크 시작...'];
  jobState.result = null;
  jobState.error = null;
  jobState.startedAt = new Date().toISOString();

  runTracking();

  return NextResponse.json({ started: true });
}

async function runTracking() {
  const send = (line: string) => {
    jobState.logs.push(line);
  };

  try {
    // 1. 노션에서 채널 목록 + 강사 목록 가져오기
    send('📋 노션에서 채널 목록 조회 중...');
    const { getYoutubeChannels, getAllLectureScheduleInstructors, addYoutubeSponsorToPage } = await import('@/lib/notion');
    const channels = await getYoutubeChannels();
    send(`  ✅ ${channels.length}개 채널 로드`);

    send('📋 강사 목록 조회 중...');
    const instructors = await getAllLectureScheduleInstructors();
    send(`  ✅ ${instructors.length}명 강사 로드`);

    // 2. 채널별 협찬 체크
    send('');
    send('🔍 유튜브 채널 크롤링 시작...');
    const { checkYoutubeSponsors } = await import('@/lib/crawler/youtube-tracker');
    const sponsored = await checkYoutubeSponsors(channels, send);
    send(`  📊 협찬 영상 ${sponsored.length}개 발견`);

    // 3. 강사 매칭 + 노션 업데이트
    send('');
    send('🔗 강사 매칭 중...');

    const sponsoredVideos: JobState['result'] extends null ? never : NonNullable<JobState['result']>['sponsoredVideos'] = [];
    const notionUpdated: string[] = [];
    const newInstructors: string[] = [];
    const unresolvable: string[] = [];

    // 오늘 기준 KST 날짜
    const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

    for (const s of sponsored) {
      if (s.isUnresolvable) {
        unresolvable.push(`${s.channelName}: ${s.videoTitle}`);
        continue;
      }

      // 같은 플랫폼 강사 중에서 채널명 기반 매칭
      const platformInstructors = instructors.filter(i => i.platform === s.platform && !!i.instructor);

      // 최근 30일 이내 또는 미래 날짜 기준으로 우선 필터
      const recentInstructors = platformInstructors.filter(i => {
        if (!i.date) return true; // 날짜 없으면 포함
        return i.date >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
      });
      const candidatePool = recentInstructors.length > 0 ? recentInstructors : platformInstructors;

      // 1순위: 협찬 페이지 텍스트에서 강사명 검색, 2순위: 채널명으로 매칭
      const matchedInstructor =
        findInstructorInPageText(s.sponsorPageText, candidatePool) ??
        matchInstructorByChannelName(s.channelName, candidatePool);

      const instructorName = matchedInstructor?.instructor || '미확인';
      const lectureDate = matchedInstructor?.date || null;

      sponsoredVideos.push({
        platform: s.platform,
        instructorName,
        lectureDate,
        channelName: s.channelName,
        videoTitle: s.videoTitle,
        videoId: s.videoId,
      });

      if (matchedInstructor) {
        const matchSource = findInstructorInPageText(s.sponsorPageText, candidatePool) ? '페이지텍스트' : '채널명';
        send(`  ✅ 매칭(${matchSource}): ${s.channelName} → ${matchedInstructor.instructor} (${s.platform}, ${matchedInstructor.date || '날짜없음'})`);

        // 노션 업데이트
        try {
          const videoUrl = `https://youtu.be/${s.videoId}`;
          await addYoutubeSponsorToPage(matchedInstructor.pageId, s.videoTitle, videoUrl);
          notionUpdated.push(matchedInstructor.instructor);
          send(`  💾 노션 업데이트: ${matchedInstructor.instructor}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('중복')) {
            send(`  ⏭️ 중복 스킵: ${matchedInstructor.instructor} (이미 등록된 영상)`);
          } else {
            send(`  ❌ 노션 업데이트 실패 (${matchedInstructor.instructor}): ${msg}`);
          }
        }
      } else {
        send(`  🆕 매칭 실패: ${s.channelName} → ${s.platform} (강사 미확인)`);
        newInstructors.push(`${s.channelName} (${s.platform})`);
      }
    }

    void todayKST; // 미사용 변수 경고 방지

    // 5. 슬랙 보고
    if (process.env.SLACK_BOT_TOKEN) {
      send('');
      send('📣 슬랙 보고 중...');
      const { sendYoutubeTrackerReport } = await import('@/lib/slack');
      await sendYoutubeTrackerReport({
        checkedCount: channels.length,
        sponsoredVideos,
        notionUpdated,
        newInstructors,
        unresolvable,
        executedAt: getKSTNow(),
      });
      send('  ✅ 슬랙 전송 완료');
    }

    jobState.result = {
      checkedChannels: channels.length,
      sponsoredCount: sponsored.filter(s => !s.isUnresolvable).length,
      updatedCount: notionUpdated.length,
      newInstructorCount: newInstructors.length,
      sponsoredVideos,
      notionUpdated,
      newInstructors,
      unresolvable,
    };
    send(`🏁 완료! 협찬 ${sponsored.length}개 발견, 노션 ${notionUpdated.length}건 업데이트`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    jobState.error = msg;
    send(`❌ 오류: ${msg}`);
  } finally {
    jobState.running = false;
  }
}

/**
 * 협찬 페이지 텍스트에서 노션 강사 목록의 이름을 검색한다.
 * 1순위: 페이지 텍스트에 강사명이 그대로 포함
 * 2순위: 강사명을 공백으로 분리한 각 단어가 모두 포함 (예: "배우는 윤" → "배우는윤")
 */
function findInstructorInPageText(
  pageText: string,
  instructors: Array<{ instructor: string; pageId: string; platform: string; date: string | null }>
): { instructor: string; pageId: string; platform: string; date: string | null } | null {
  if (!pageText || instructors.length === 0) return null;

  const sorted = [...instructors].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 1순위: 완전 포함
  for (const inst of sorted) {
    if (!inst.instructor || inst.instructor.length < 2) continue;
    if (pageText.includes(inst.instructor)) return inst;
  }

  // 2순위: 공백 제거 후 포함 (페이지에 "배우는 윤"이 있고 DB에 "배우는윤"인 경우)
  const pageNorm = pageText.replace(/\s+/g, '');
  for (const inst of sorted) {
    if (!inst.instructor || inst.instructor.length < 2) continue;
    const instNorm = inst.instructor.replace(/\s+/g, '');
    if (pageNorm.includes(instNorm)) return inst;
  }

  return null;
}

/**
 * 유튜브 채널명과 노션 강사명을 비교하여 가장 유사한 강사를 찾는다.
 * 매칭 전략 (우선순위 순):
 * 1. 채널명에 강사명이 포함 (또는 강사명에 채널명이 포함)
 * 2. 채널명/강사명에서 특수문자·공백 제거 후 부분 매칭
 * 3. 2글자 이상 공통 부분 문자열 존재 여부
 */
function matchInstructorByChannelName(
  channelName: string,
  instructors: Array<{ instructor: string; pageId: string; platform: string; date: string | null }>
): { instructor: string; pageId: string; platform: string; date: string | null } | null {
  if (instructors.length === 0) return null;

  const normalize = (s: string) => s.replace(/[^\w가-힣]/g, '').toLowerCase();
  const chanNorm = normalize(channelName);

  // 1순위: 완전 포함 매칭 (날짜 최신순)
  const exactMatches = instructors.filter(i => {
    const instNorm = normalize(i.instructor);
    return chanNorm.includes(instNorm) || instNorm.includes(chanNorm);
  });
  if (exactMatches.length > 0) {
    return exactMatches.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  }

  // 2순위: 3글자 이상 공통 부분 문자열
  const partialMatches = instructors.filter(i => {
    const instNorm = normalize(i.instructor);
    return longestCommonSubstring(chanNorm, instNorm) >= 3;
  });
  if (partialMatches.length > 0) {
    return partialMatches.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  }

  return null;
}

function longestCommonSubstring(a: string, b: string): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let len = 0;
      while (i + len < a.length && j + len < b.length && a[i + len] === b[j + len]) len++;
      if (len > max) max = len;
    }
  }
  return max;
}
