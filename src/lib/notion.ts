
const SCHEDULE_DB_ID = process.env.NOTION_SCHEDULE_DB_ID!;
const REPORT_DB_ID = process.env.NOTION_REPORT_DB_ID!;
const NOTION_API_VERSION = '2022-06-28';

// SDK 호환성 문제 우회 — REST API 직접 호출
async function scheduleRequest(path: string, body: unknown): Promise<{ results?: unknown[] }> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_API_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status}: ${text}`);
  }
  return res.json();
}

export interface LectureSchedule {
  instructor: string;
  courseTitle: string;
  platform: string;
  date: string;
  url?: string;
}

export interface CrawlResult {
  instructor: string;
  courseTitle: string;
  platform: string;
  date: string;
  optionName: string;
  optionPrice: number;
  enrollmentCount: number;
}

// 1단계: 노션 '타사 강의 일정' DB에서 어제 날짜 강의 조회
export async function getYesterdayLectures(): Promise<LectureSchedule[]> {
  const yesterday = getYesterdayDateKST();

  const platforms = [
    '타이탄클래스', '아이비클래스', '핏크닉', '코주부클래스', '인베이더스쿨',
    '하버드클래스', '아마겟돈클래스', 'N잡연구소', '머니업클래스', '부업의정석'
  ];

  const results: LectureSchedule[] = [];

  // 10개 플랫폼 병렬 검색 (REST API 직접 호출 — SDK 호환성 문제 우회)
  const searches = await Promise.allSettled(
    platforms.map(platform =>
      scheduleRequest(`/databases/${SCHEDULE_DB_ID}/query`, {
        filter: {
          and: [
            { property: '플랫폼', select: { equals: platform } },
            { property: '날짜 ', date: { equals: yesterday } }, // 날짜 뒤 공백 주의!
          ],
        },
      })
    )
  );

  for (let idx = 0; idx < searches.length; idx++) {
    const result = searches[idx];
    if (result.status === 'fulfilled') {
      for (const page of (result.value.results ?? [])) {
        const props = (page as any).properties;
        results.push({
          instructor: props['강사']?.title?.[0]?.plain_text || '',
          courseTitle: props['강의 제목']?.rich_text?.[0]?.plain_text || '',
          platform: props['플랫폼']?.select?.name || '',
          url: props['URL']?.url || undefined,
          date: yesterday,
        });
      }
    } else {
      console.error(`[Notion] ${platforms[idx]} 조회 실패:`, result.reason);
    }
  }
  console.log(`[Notion] ${yesterday} 강의 ${results.length}건 조회:`, results.map(r => `${r.platform}-${r.instructor}`).join(', '));

  return results;
}

// 3단계: 노션 '강의 전환 리포트' DB에 결과 기록 (REST API 직접 호출 — SDK 호환성 문제 우회)
export async function writeReport(results: CrawlResult[]): Promise<void> {
  for (const r of results) {
    await scheduleRequest('/pages', {
      parent: { database_id: REPORT_DB_ID },
      properties: {
        '강사명': { title: [{ text: { content: r.instructor } }] },
        '강의 제목': { rich_text: [{ text: { content: r.courseTitle } }] },
        '날짜': { date: { start: r.date } },
        '플랫폼': { select: { name: r.platform } },
        '옵션1 이름': { rich_text: [{ text: { content: r.optionName } }] },
        '옵션1 가격': { number: r.optionPrice },
        '옵션1 결제건수': { number: r.enrollmentCount },
      },
    });
  }
}

function getYesterdayDateKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setDate(kst.getDate() - 1);
  return kst.toISOString().split('T')[0];
}

// ── 무료강의 모니터링 ──
// @notionhq/client의 databases.query 호환성 문제로 REST API 직접 호출

const FREE_COURSE_DB_ID = '2d1b6ef7-b800-8069-8792-e103d12f9a4f';
const NOTION_VERSION = '2022-06-28';

async function notionRequest(path: string, body: unknown): Promise<{ results?: unknown[] }> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function checkFreeCourseExists(url: string): Promise<boolean> {
  const data = await notionRequest(`/databases/${FREE_COURSE_DB_ID}/query`, {
    filter: { property: 'URL', url: { equals: url } },
    page_size: 1,
  });
  return (data.results?.length ?? 0) > 0;
}

export async function saveFreeCourse(course: {
  instructor: string;
  courseTitle: string;
  date: string | null;
  isDatetime: boolean;
  platform: string;
  url: string;
}): Promise<void> {
  const properties: Record<string, unknown> = {
    '강사': { title: [{ text: { content: course.instructor } }] },
    '강의 제목': { rich_text: [{ text: { content: course.courseTitle } }] },
    '플랫폼': { select: { name: course.platform } },
    'URL': { url: course.url },
  };

  if (course.date) {
    properties['날짜 '] = { date: { start: course.date } };
  }

  await notionRequest('/pages', {
    parent: { database_id: FREE_COURSE_DB_ID },
    properties,
  });
}

// ── 유튜브 협찬 트래커 ──

const YOUTUBE_SPONSOR_DB_ID = '2d3b6ef7-b800-808f-bedf-e7202a0c0dd4';

export async function getYoutubeChannels(): Promise<Array<{ channelName: string; channelUrl: string }>> {
  const data = await notionRequest(`/databases/${YOUTUBE_SPONSOR_DB_ID}/query`, {
    page_size: 100,
  });

  const channels: Array<{ channelName: string; channelUrl: string }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const page of (data.results || []) as any[]) {
    const props = page.properties;
    const name = props?.['유튜브']?.title?.[0]?.plain_text || '';
    const url = props?.['채널 URL']?.url || '';
    if (name && url) {
      channels.push({ channelName: name, channelUrl: url });
    }
  }

  return channels;
}

export async function getAllLectureScheduleInstructors(): Promise<Array<{
  instructor: string;
  pageId: string;
  platform: string;
  date: string | null;
}>> {
  const results: Array<{ instructor: string; pageId: string; platform: string; date: string | null }> = [];
  let hasMore = true;
  let startCursor: string | undefined;

  while (hasMore) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await notionRequest(`/databases/${SCHEDULE_DB_ID}/query`, body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const page of (data.results || []) as any[]) {
      const props = page.properties;
      results.push({
        instructor: props?.['강사']?.title?.[0]?.plain_text || '',
        pageId: page.id,
        platform: props?.['플랫폼']?.select?.name || '',
        date: props?.['날짜 ']?.date?.start || null,
      });
    }

    hasMore = data.has_more === true;
    startCursor = data.next_cursor;
  }

  return results;
}

export async function addYoutubeSponsorToPage(pageId: string, videoTitle: string, videoUrl: string): Promise<void> {
  const headers = {
    'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };

  // 1. 페이지 블록 목록 조회 → 기존 "유튜브 협찬" 토글 찾기
  const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'GET',
    headers,
  });
  if (!blocksRes.ok) {
    const text = await blocksRes.text();
    throw new Error(`Notion blocks GET ${blocksRes.status}: ${text}`);
  }
  const blocksData = await blocksRes.json();

  let toggleBlockId: string | null = null;
  for (const block of (blocksData.results || [])) {
    if (block.type === 'heading_3' && block.heading_3?.is_toggleable) {
      const plainText = block.heading_3?.rich_text?.[0]?.plain_text || '';
      if (plainText.includes('유튜브 협찬')) {
        toggleBlockId = block.id;
        break;
      }
    }
  }

  // 2. 토글 없으면 새로 생성
  if (!toggleBlockId) {
    const createRes = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        children: [{
          type: 'heading_3',
          heading_3: { rich_text: [{ text: { content: '유튜브 협찬' } }], is_toggleable: true },
        }],
      }),
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      throw new Error(`Notion heading create ${createRes.status}: ${text}`);
    }
    const createData = await createRes.json();
    toggleBlockId = createData.results?.[0]?.id;
  }

  if (!toggleBlockId) throw new Error('유튜브 협찬 토글 블록 생성 실패');

  // 3. 토글 내 기존 블록 조회 → 중복 체크 (같은 URL이 이미 있으면 스킵)
  const existingRes = await fetch(`https://api.notion.com/v1/blocks/${toggleBlockId}/children`, {
    method: 'GET',
    headers,
  });
  if (existingRes.ok) {
    const existingData = await existingRes.json();
    for (const block of (existingData.results || [])) {
      const richText = block.paragraph?.rich_text || block.heading_3?.rich_text || [];
      for (const rt of richText) {
        if (rt?.href === videoUrl || rt?.text?.link?.url === videoUrl || rt?.text?.content === videoUrl) {
          return; // 이미 등록된 영상 — 중복 스킵
        }
      }
    }
  }

  // 4. 토글 안에 영상 정보 추가
  const appendRes = await fetch(`https://api.notion.com/v1/blocks/${toggleBlockId}/children`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      children: [
        { type: 'paragraph', paragraph: { rich_text: [{ text: { content: videoTitle }, annotations: { bold: true } }] } },
        { type: 'paragraph', paragraph: { rich_text: [{ text: { content: videoUrl, link: { url: videoUrl } } }] } },
      ],
    }),
  });
  if (!appendRes.ok) {
    const text = await appendRes.text();
    throw new Error(`Notion block append ${appendRes.status}: ${text}`);
  }
}
