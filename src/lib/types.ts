export interface Platform {
  id: string;
  name: string;
  slug: string;
  coursesUrl: string;
  extractionMethod: 'trpc' | 'rsc-script' | 'rsc-fetch' | 'cojooboo' | 'api' | 'login-required';
  enrollmentField: string;
  requiresLogin: boolean;
}

export const PLATFORMS: Platform[] = [
  {
    id: 'titan',
    name: '타이탄클래스',
    slug: 'titanclass',
    coursesUrl: 'https://www.titanclass.co.kr/courses',
    extractionMethod: 'trpc',
    enrollmentField: 'enrollmentCount',
    requiresLogin: false,
  },
  {
    id: 'harvard',
    name: '하버드클래스',
    slug: 'harvardclass',
    coursesUrl: 'https://harvardclass.co.kr/courses',
    extractionMethod: 'rsc-script',
    enrollmentField: 'enrollcount',
    requiresLogin: false,
  },
  {
    id: 'cojooboo',
    name: '코주부클래스',
    slug: 'cojooboo',
    coursesUrl: 'https://www.cojooboo.co.kr/courses',
    extractionMethod: 'cojooboo',
    enrollmentField: 'enrollments',
    requiresLogin: false,
  },
  {
    id: 'ivy',
    name: '아이비클래스',
    slug: 'ivyclass',
    coursesUrl: 'https://www.ivyclass.co.kr/courses',
    extractionMethod: 'rsc-fetch',
    enrollmentField: 'enrollments',
    requiresLogin: false,
  },
  {
    id: 'invader',
    name: '인베이더스쿨',
    slug: 'invader',
    coursesUrl: 'https://www.invader.co.kr/courses',
    extractionMethod: 'rsc-fetch',
    enrollmentField: 'enrollments',
    requiresLogin: false,
  },
  {
    id: 'nlab',
    name: 'N잡연구소',
    slug: 'nlab',
    coursesUrl: 'https://www.nlab.kr/courses',
    extractionMethod: 'rsc-fetch',
    enrollmentField: 'enrollments',
    requiresLogin: false,
  },
  {
    id: 'armageddon',
    name: '아마겟돈클래스',
    slug: 'amag-class',
    coursesUrl: 'https://amag-class.kr/Class',
    extractionMethod: 'login-required',
    enrollmentField: 'memberCnt',
    requiresLogin: true,
  },
  {
    id: 'moneyup',
    name: '머니업클래스',
    slug: 'moneyup',
    coursesUrl: 'https://www.moneyupclass.co.kr/courses',
    extractionMethod: 'rsc-fetch',
    enrollmentField: 'enrollments',
    requiresLogin: false,
  },
  {
    id: 'sidejob',
    name: '부업의정석',
    slug: 'sidejob',
    coursesUrl: 'https://www.buup.kr/courses',
    extractionMethod: 'rsc-fetch',
    enrollmentField: 'enrollments',
    requiresLogin: false,
  },
  {
    id: 'fitcnic',
    name: '핏크닉',
    slug: 'fitcnic',
    coursesUrl: 'https://www.fitcnic.co.kr/courses',
    extractionMethod: 'rsc-fetch',
    enrollmentField: 'enrollments',
    requiresLogin: false,
  },
];

export interface CrawlResultData {
  platform: string;
  instructor: string;
  courseTitle: string;
  enrollmentCount: number | null;
  price: number | null;
  optionName: string;
  estimatedRevenue: number | null;
  status: 'success' | 'failed' | 'skipped';
  errorMessage?: string;
}

export interface DailyReport {
  date: string;
  results: CrawlResultData[];
  totalEnrollments: number;
  totalRevenue: number;
  successCount: number;
  failCount: number;
}
