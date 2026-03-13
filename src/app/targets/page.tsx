'use client';

import { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import Link from 'next/link';

const PLATFORM_OPTIONS = [
  '타이탄클래스', '하버드클래스', '코주부클래스', '아이비클래스', '인베이더스쿨',
  'N잡연구소', '아마겟돈클래스', '머니업클래스', '부업의정석', '핏크닉',
];

interface Target {
  id: string;
  target_date: string;
  platform: string;
  instructor: string;
  course_title: string;
}

export default function TargetsPage() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
  const [form, setForm] = useState({ platform: PLATFORM_OPTIONS[0], instructor: '', course_title: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchTargets();
  }, [selectedDate]);

  async function fetchTargets() {
    try {
      const res = await fetch(`/api/targets?date=${selectedDate}`);
      const data = await res.json();
      setTargets(data.targets || []);
    } catch {
      setTargets([]);
    }
  }

  async function addTarget() {
    if (!form.instructor || !form.course_title) {
      setMessage('강사명과 강의 제목을 입력하세요.');
      return;
    }

    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_date: selectedDate,
          ...form,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('추가되었습니다.');
        setForm(prev => ({ ...prev, instructor: '', course_title: '' }));
        fetchTargets();
      } else {
        setMessage(`실패: ${data.error}`);
      }
    } catch {
      setMessage('오류 발생');
    }
  }

  async function removeTarget(id: string) {
    try {
      await fetch(`/api/targets?id=${id}`, { method: 'DELETE' });
      fetchTargets();
    } catch {}
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/" className="text-gray-500 hover:text-gray-700">&larr; 대시보드</Link>
        <h1 className="text-2xl font-bold text-gray-900">크롤링 대상 관리</h1>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        노션 연동 전까지 여기서 크롤링할 강의를 수동으로 등록하세요.
        노션 연동 후에는 자동으로 가져옵니다.
      </p>

      {message && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
          {message}
        </div>
      )}

      {/* Date Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">대상 날짜</label>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Add Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">강의 추가</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">플랫폼</label>
            <select
              value={form.platform}
              onChange={e => setForm(prev => ({ ...prev, platform: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {PLATFORM_OPTIONS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">강사명</label>
            <input
              type="text"
              value={form.instructor}
              onChange={e => setForm(prev => ({ ...prev, instructor: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="예: 유프로"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">강의 제목</label>
            <input
              type="text"
              value={form.course_title}
              onChange={e => setForm(prev => ({ ...prev, course_title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="예: [유프로] 시니어 롱폼"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={addTarget}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              추가
            </button>
          </div>
        </div>
      </div>

      {/* Targets List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {selectedDate} 크롤링 대상 ({targets.length}건)
          </h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">플랫폼</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">강사</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">강의 제목</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">삭제</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {targets.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                  등록된 대상이 없습니다
                </td>
              </tr>
            ) : (
              targets.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{t.platform}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{t.instructor}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{t.course_title}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => removeTarget(t.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
