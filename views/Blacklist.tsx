import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { MOCK_BLACKLIST } from '../constants';
import { BlacklistRecord } from '../types';

interface AggregatedHotel {
  key: string;
  chainId: string;
  hotelName: string;
  count: number;
  maxSeverity: 'HIGH' | 'MEDIUM' | 'LOW';
  lastDate: string;
  records: BlacklistRecord[];
  tags: Set<string>;
}

type Severity = 'HIGH' | 'MEDIUM' | 'LOW';

const severityWeight: Record<Severity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export const Blacklist: React.FC = () => {
  const TOKEN_KEY = 'skyhotel_auth_token';
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<BlacklistRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedHotel, setSelectedHotel] = useState<AggregatedHotel | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRecord, setEditingRecord] = useState<BlacklistRecord | null>(null);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    chainId: '',
    hotelName: '',
    severity: 'MEDIUM' as Severity,
    reason: '',
    tagsText: '',
    status: 'ACTIVE' as 'ACTIVE' | 'RESOLVED'
  });

  const fetchWithAuth = async (url: string, options?: RequestInit) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      throw new Error('登录已过期，请重新登录');
    }

    const headers = new Headers(options?.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (options?.body && !headers.get('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || '请求失败');
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  };

  const loadRecords = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWithAuth(`/api/blacklist/records${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ''}`);
      setRecords(data.items || []);
    } catch (err: any) {
      setError(err.message || '加载黑名单失败，已回退到本地数据');
      setRecords(MOCK_BLACKLIST);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const aggregatedData = useMemo(() => {
    const map: Record<string, AggregatedHotel> = {};

    records.forEach((record) => {
      const chainId = record.chainId || 'UNKNOWN';
      const key = `${chainId}::${record.hotelName}`;
      if (!map[key]) {
        map[key] = {
          key,
          chainId,
          hotelName: record.hotelName,
          count: 0,
          maxSeverity: 'LOW',
          lastDate: '',
          records: [],
          tags: new Set()
        };
      }

      const hotel = map[key];
      hotel.count += 1;
      hotel.records.push(record);
      record.tags.forEach((tag) => hotel.tags.add(tag));

      if (severityWeight[record.severity] > severityWeight[hotel.maxSeverity]) {
        hotel.maxSeverity = record.severity;
      }
      if (record.date > hotel.lastDate) {
        hotel.lastDate = record.date;
      }
    });

    return Object.values(map).sort((a, b) => {
      if (severityWeight[a.maxSeverity] !== severityWeight[b.maxSeverity]) {
        return severityWeight[b.maxSeverity] - severityWeight[a.maxSeverity];
      }
      return b.count - a.count;
    });
  }, [records]);

  const filteredData = aggregatedData.filter((hotel) => {
    if (!query.trim()) {
      return true;
    }
    const keyword = query.trim().toLowerCase();
    return (
      hotel.hotelName.toLowerCase().includes(keyword) ||
      hotel.chainId.toLowerCase().includes(keyword) ||
      Array.from(hotel.tags).some((tag) => tag.toLowerCase().includes(keyword))
    );
  });

  const renderSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">严重避雷</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-700">体验极差</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-700">普通吐槽</span>;
      default:
        return null;
    }
  };

  const openCreate = () => {
    setEditingRecord(null);
    setFormError('');
    setForm({ chainId: '', hotelName: '', severity: 'MEDIUM', reason: '', tagsText: '', status: 'ACTIVE' });
    setIsFormOpen(true);
  };

  const openEdit = (record: BlacklistRecord) => {
    setEditingRecord(record);
    setFormError('');
    setForm({
      chainId: record.chainId || 'UNKNOWN',
      hotelName: record.hotelName,
      severity: record.severity,
      reason: record.reason,
      tagsText: record.tags.join(', '),
      status: record.status || 'ACTIVE'
    });
    setIsFormOpen(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.chainId.trim() || !form.hotelName.trim() || !form.reason.trim()) {
      setFormError('chainId、酒店名、原因为必填项');
      return;
    }

    setSaving(true);
    setFormError('');
    const payload = {
      chainId: form.chainId.trim(),
      hotelName: form.hotelName.trim(),
      severity: form.severity,
      reason: form.reason.trim(),
      tags: form.tagsText
        .split(',')
        .map((it) => it.trim())
        .filter(Boolean),
      status: form.status
    };

    try {
      if (editingRecord) {
        const updated = await fetchWithAuth(`/api/blacklist/records/${editingRecord.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        setRecords((prev) => prev.map((it) => (it.id === editingRecord.id ? updated : it)));
      } else {
        const created = await fetchWithAuth('/api/blacklist/records', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setRecords((prev) => [created, ...prev]);
      }

      setIsFormOpen(false);
    } catch (err: any) {
      setFormError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (record: BlacklistRecord) => {
    if (!window.confirm(`确认删除记录 ${record.id} 吗？`)) {
      return;
    }

    try {
      await fetchWithAuth(`/api/blacklist/records/${record.id}`, { method: 'DELETE' });
      setRecords((prev) => prev.filter((it) => it.id !== record.id));
      if (selectedHotel) {
        setSelectedHotel(null);
      }
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const resolveRecord = async (record: BlacklistRecord) => {
    try {
      const updated = await fetchWithAuth(`/api/blacklist/records/${record.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: record.status === 'RESOLVED' ? 'ACTIVE' : 'RESOLVED' })
      });
      setRecords((prev) => prev.map((it) => (it.id === record.id ? updated : it)));
    } catch (err: any) {
      alert(err.message || '更新状态失败');
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          🚫 酒店黑名单
          <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {records.length} 条记录 / 涉及 {aggregatedData.length} 家酒店
          </span>
        </h2>
        <p className="text-gray-500 text-sm">核心标识：chainId + 酒店名。可供其他模块按条件查询调用。</p>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-3 text-gray-400">🔍</span>
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            placeholder="搜索 chainId / 酒店名称 / 标签"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button onClick={loadRecords} className="bg-gray-800 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-gray-900 shadow-sm">
          查询
        </button>
        <button onClick={openCreate} className="bg-red-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-red-700 shadow-sm">
          + 新增黑名单
        </button>
      </div>

      {error && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</div>}

      <Card className="flex-1 overflow-hidden flex flex-col p-0">
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-3 whitespace-nowrap">chainId</th>
                <th className="px-6 py-3 whitespace-nowrap">酒店名称</th>
                <th className="px-6 py-3 whitespace-nowrap text-center">次数</th>
                <th className="px-6 py-3 whitespace-nowrap text-center">最高风险</th>
                <th className="px-6 py-3 whitespace-nowrap">涉及标签</th>
                <th className="px-6 py-3 whitespace-nowrap">最近上报</th>
                <th className="px-6 py-3 whitespace-nowrap text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">加载中...</td>
                </tr>
              ) : (
                filteredData.map((hotel) => (
                  <tr key={hotel.key} className="hover:bg-red-50/30 transition-colors cursor-pointer" onClick={() => setSelectedHotel(hotel)}>
                    <td className="px-6 py-4 font-mono text-xs text-gray-600">{hotel.chainId}</td>
                    <td className="px-6 py-4 font-bold text-gray-800">{hotel.hotelName}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600 font-bold text-xs">{hotel.count}</span>
                    </td>
                    <td className="px-6 py-4 text-center">{renderSeverityBadge(hotel.maxSeverity)}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {Array.from(hotel.tags).slice(0, 3).map((tag) => (
                          <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded border border-gray-200">{tag}</span>
                        ))}
                        {hotel.tags.size > 3 && <span className="text-xs text-gray-400">+{hotel.tags.size - 3}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500 font-mono text-xs">{hotel.lastDate}</td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-blue-600 hover:text-blue-800 font-medium text-xs">查看详情</button>
                    </td>
                  </tr>
                ))
              )}
              {!loading && filteredData.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">未找到相关酒店记录，请尝试其他关键词。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedHotel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedHotel(null)}>
          <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="bg-red-600 text-white px-6 py-4 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-xl">{selectedHotel.hotelName}</h3>
                  <span className="bg-white/20 text-white px-2 py-0.5 rounded text-xs font-mono">{selectedHotel.chainId}</span>
                  <span className="bg-white/20 text-white px-2 py-0.5 rounded text-xs font-mono">共 {selectedHotel.count} 条</span>
                </div>
                <p className="text-red-100 text-sm opacity-90">可在此直接编辑、删除或标记处理状态。</p>
              </div>
              <button onClick={() => setSelectedHotel(null)} className="text-white/60 hover:text-white text-2xl leading-none">&times;</button>
            </div>

            <div className="p-6 overflow-y-auto bg-gray-50 flex-1 space-y-4">
              {selectedHotel.records.sort((a, b) => b.date.localeCompare(a.date)).map((record) => (
                <div key={record.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      {renderSeverityBadge(record.severity)}
                      <span className="text-xs text-gray-400">ID: {record.id}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${record.status === 'RESOLVED' ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
                        {record.status === 'RESOLVED' ? '已处理' : '生效中'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 font-mono">{record.date}</div>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700 leading-relaxed mb-3 border border-gray-100">{record.reason}</div>

                  <div className="flex justify-between items-center">
                    <div className="flex gap-2 flex-wrap">
                      {record.tags.map((tag) => (
                        <span key={tag} className="text-xs text-gray-500">#{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{record.reportedBy}</span>
                      <button onClick={() => resolveRecord(record)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">
                        {record.status === 'RESOLVED' ? '恢复生效' : '标记已处理'}
                      </button>
                      <button onClick={() => openEdit(record)} className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50">编辑</button>
                      <button onClick={() => deleteRecord(record)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50">删除</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white border-t border-gray-100 p-4 text-center">
              <button onClick={() => setSelectedHotel(null)} className="bg-gray-100 text-gray-600 px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">关闭</button>
            </div>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsFormOpen(false)}>
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">{editingRecord ? '编辑黑名单记录' : '新增黑名单记录'}</h3>
              <button onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <form onSubmit={submitForm} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">chainId</label>
                  <input value={form.chainId} onChange={(e) => setForm((prev) => ({ ...prev, chainId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="如：ATOUR" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">风险等级</label>
                  <select value={form.severity} onChange={(e) => setForm((prev) => ({ ...prev, severity: e.target.value as Severity }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="HIGH">HIGH 严重避雷</option>
                    <option value="MEDIUM">MEDIUM 体验差</option>
                    <option value="LOW">LOW 普通吐槽</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">酒店名称</label>
                <input value={form.hotelName} onChange={(e) => setForm((prev) => ({ ...prev, hotelName: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="酒店全称" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">风险原因</label>
                <textarea value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-20" placeholder="详细描述问题" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">标签（逗号分隔）</label>
                  <input value={form.tagsText} onChange={(e) => setForm((prev) => ({ ...prev, tagsText: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="如：卫生差, 态度恶劣" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">状态</label>
                  <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as 'ACTIVE' | 'RESOLVED' }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="ACTIVE">ACTIVE 生效中</option>
                    <option value="RESOLVED">RESOLVED 已处理</option>
                  </select>
                </div>
              </div>

              {formError && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{formError}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">取消</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                  {saving ? '保存中...' : editingRecord ? '保存修改' : '创建记录'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
