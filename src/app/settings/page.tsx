'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Credential {
  platform: string;
  login_type: string;
  email: string;
  password: string;
}

interface Schedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  days_of_week: number[];
  hour: number;
  minute: number;
  last_run_at: string | null;
}

const PLATFORMS_NEEDING_LOGIN = [
  { id: 'armageddon', name: '아마겟돈클래스', loginType: 'kakao' },
];

const WEEKDAYS = [
  { label: '일', value: 0 },
  { label: '월', value: 1 },
  { label: '화', value: 2 },
  { label: '수', value: 3 },
  { label: '목', value: 4 },
  { label: '금', value: 5 },
  { label: '토', value: 6 },
];

export default function SettingsPage() {
  const [credentials, setCredentials] = useState<Record<string, Credential>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [integrationStatus, setIntegrationStatus] = useState({ notion: false, slack: false });

  // Schedule state
  const [schedule, setSchedule] = useState<Schedule>({
    enabled: false,
    frequency: 'daily',
    days_of_week: [1, 2, 3, 4, 5],
    hour: 9,
    minute: 0,
    last_run_at: null,
  });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetchCredentials();
    checkIntegrations();
    fetchSchedule();
  }, []);

  async function fetchCredentials() {
    try {
      const res = await fetch('/api/settings/credentials');
      const data = await res.json();
      if (data.credentials) {
        const map: Record<string, Credential> = {};
        data.credentials.forEach((c: any) => { map[c.platform] = c; });
        setCredentials(map);
      }
    } catch {}
  }

  async function checkIntegrations() {
    try {
      const res = await fetch('/api/settings/integrations');
      const data = await res.json();
      setIntegrationStatus(data);
    } catch {}
  }

  async function fetchSchedule() {
    try {
      const res = await fetch('/api/schedule');
      const data = await res.json();
      setSchedule(data);
    } catch {}
  }

  async function saveCredential(platformId: string) {
    setSaving(true);
    const cred = credentials[platformId];
    if (!cred) return;
    try {
      const res = await fetch('/api/settings/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cred),
      });
      const data = await res.json();
      setMessage(data.success ? `${platformId} 자격 증명이 저장되었습니다.` : `저장 실패: ${data.error}`);
    } catch {
      setMessage('저장 중 오류 발생');
    } finally {
      setSaving(false);
    }
  }

  function updateCredential(platformId: string, field: string, value: string) {
    setCredentials(prev => ({
      ...prev,
      [platformId]: { ...prev[platformId], platform: platformId, login_type: 'kakao', [field]: value },
    }));
  }

  async function saveSchedule() {
    setScheduleSaving(true);
    setScheduleMessage(null);
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule),
      });
      const data = await res.json();
      if (data.success) {
        setScheduleMessage({ text: '✅ 스케줄이 저장되었습니다.', type: 'success' });
        if (data.schedule) setSchedule(data.schedule);
      } else {
        setScheduleMessage({ text: `❌ 저장 실패: ${data.error}`, type: 'error' });
      }
    } catch {
      setScheduleMessage({ text: '❌ 저장 중 오류 발생', type: 'error' });
    } finally {
      setScheduleSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setScheduleMessage({ text: '⏳ 크롤링 실행 중... 수 분이 걸릴 수 있어요', type: 'info' });
    try {
      const res = await fetch('/api/schedule/run', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setScheduleMessage({
          text: `✅ 완료! 성공 ${data.successCount}건 / 실패 ${data.failCount}건`,
          type: 'success',
        });
        await fetchSchedule();
      } else {
        setScheduleMessage({ text: `❌ 실패: ${data.error}`, type: 'error' });
      }
    } catch {
      setScheduleMessage({ text: '❌ 실행 중 오류 발생', type: 'error' });
    } finally {
      setRunning(false);
    }
  }

  function toggleDay(day: number) {
    setSchedule(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day].sort(),
    }));
  }

  function formatLastRun(lastRunAt: string | null): string {
    if (!lastRunAt) return '아직 실행된 적 없음';
    const kst = new Date(new Date(lastRunAt).getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().replace('T', ' ').substring(0, 16) + ' KST';
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/" className="text-gray-500 hover:text-gray-700">&larr; 대시보드</Link>
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
      </div>

      {message && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
          {message}
        </div>
      )}

      {/* Schedule Settings */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">자동 실행 스케줄</h2>
        <p className="text-sm text-gray-500 mb-4">
          설정한 시간에 자동으로 노션 일정을 읽어 크롤링하고 결과를 노션 리포트에 업로드합니다.
          <br />
          <span className="text-xs text-orange-600">외부 cron 서비스(cron-job.org 등)에서 <code>/api/schedule/check</code>를 1분마다 호출해야 작동합니다.</span>
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">스케줄 활성화</p>
              <p className="text-xs text-gray-400 mt-0.5">마지막 실행: {formatLastRun(schedule.last_run_at)}</p>
            </div>
            <button
              onClick={() => setSchedule(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`relative w-12 h-6 rounded-full transition-colors ${schedule.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${schedule.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Frequency */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">실행 주기</p>
            <div className="flex gap-3">
              {[{ label: '매일', value: 'daily' }, { label: '매주', value: 'weekly' }].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSchedule(prev => ({ ...prev, frequency: opt.value as 'daily' | 'weekly' }))}
                  className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    schedule.frequency === opt.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Days of week (weekly only) */}
          {schedule.frequency === 'weekly' && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">실행 요일</p>
              <div className="flex gap-2">
                {WEEKDAYS.map(day => (
                  <button
                    key={day.value}
                    onClick={() => toggleDay(day.value)}
                    className={`w-10 h-10 rounded-full text-sm font-medium border transition-colors ${
                      schedule.days_of_week.includes(day.value)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Time */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">실행 시간 (KST)</p>
            <div className="flex items-center gap-2">
              <select
                value={schedule.hour}
                onChange={e => setSchedule(prev => ({ ...prev, hour: Number(e.target.value) }))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}시</option>
                ))}
              </select>
              <span className="text-gray-400">:</span>
              <select
                value={schedule.minute}
                onChange={e => setSchedule(prev => ({ ...prev, minute: Number(e.target.value) }))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[0, 10, 15, 20, 30, 45].map(m => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
                ))}
              </select>
            </div>
          </div>

          {scheduleMessage && (
            <div className={`p-3 rounded-lg text-sm font-medium ${
              scheduleMessage.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
              scheduleMessage.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
              'bg-blue-50 text-blue-800 border border-blue-200'
            }`}>
              {scheduleMessage.text}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={saveSchedule}
              disabled={scheduleSaving}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {scheduleSaving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={runNow}
              disabled={running}
              className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {running ? '실행 중...' : '▶ 지금 바로 실행'}
            </button>
          </div>
        </div>
      </section>

      {/* Login Credentials */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">플랫폼 로그인 정보</h2>
        <p className="text-sm text-gray-500 mb-4">
          로그인이 필요한 플랫폼의 자격 증명을 입력하세요. Supabase에 암호화되어 저장됩니다.
        </p>
        {PLATFORMS_NEEDING_LOGIN.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <h3 className="font-medium text-gray-900 mb-4">{p.name} ({p.loginType} 로그인)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일/아이디</label>
                <input
                  type="email"
                  value={credentials[p.id]?.email || ''}
                  onChange={e => updateCredential(p.id, 'email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="kakao@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
                <input
                  type="password"
                  value={credentials[p.id]?.password || ''}
                  onChange={e => updateCredential(p.id, 'password', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <button
              onClick={() => saveCredential(p.id)}
              disabled={saving}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-400"
            >
              저장
            </button>
          </div>
        ))}
      </section>

      {/* Integration Status */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">외부 연동 상태</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`p-6 rounded-xl border ${integrationStatus.notion ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
            <h3 className="font-medium text-gray-900">Notion</h3>
            <p className="text-sm text-gray-500 mt-1">
              {integrationStatus.notion ? '✅ 연동됨' : '⬜ 미연동 (환경변수 설정 필요)'}
            </p>
          </div>
          <div className={`p-6 rounded-xl border ${integrationStatus.slack ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
            <h3 className="font-medium text-gray-900">Slack</h3>
            <p className="text-sm text-gray-500 mt-1">
              {integrationStatus.slack ? '✅ 연동됨' : '⬜ 미연동 (환경변수 설정 필요)'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
