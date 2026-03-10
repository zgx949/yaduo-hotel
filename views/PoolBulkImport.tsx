import React, { useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';

interface DraftRow {
  id: string;
  token: string;
  phone: string;
  remark: string;
  is_enabled: boolean;
  is_online: boolean;
  is_new_user: boolean;
  is_platinum: boolean;
  dailyOrdersLeft: number;
  corporateRaw: string;
  parseError?: string;
}

const TOKEN_KEY = 'skyhotel_auth_token';

const splitLine = (line: string, delimiter: string) => {
  if (delimiter) {
    return line.split(delimiter).map((it) => it.trim());
  }
  return line.split(/[\s,，|;；]+/).map((it) => it.trim());
};

const buildCorporateAgreements = (raw: string) => {
  return raw
    .split(/[;,，、|]/)
    .map((it) => it.trim())
    .filter(Boolean)
    .map((name, idx) => ({ id: `corp-${idx + 1}`, name, enabled: true }));
};

export const PoolBulkImport: React.FC = () => {
  const [rawText, setRawText] = useState('');
  const [delimiter, setDelimiter] = useState(',');
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchType, setBatchType] = useState({
    is_enabled: true,
    is_online: true,
    is_new_user: false,
    is_platinum: false,
    dailyOrdersLeft: 0,
    corporateRaw: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || '请求失败');
    }
    return data;
  };

  const parseInput = () => {
    setError('');
    setMessage('');
    const lines = rawText
      .split(/\r?\n/)
      .map((it) => it.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setRows([]);
      setSelectedIds([]);
      return;
    }

    const parsed = lines.map((line, index) => {
      const parts = splitLine(line, delimiter);
      const token = String(parts[0] || '').trim();
      const phone = String(parts[1] || '').trim();
      const remark = String(parts[2] || '').trim();
      const dailyOrdersLeft = Math.max(0, Number(parts[3]) || 0);
      return {
        id: `line-${index + 1}`,
        token,
        phone,
        remark,
        is_enabled: true,
        is_online: true,
        is_new_user: false,
        is_platinum: false,
        dailyOrdersLeft,
        corporateRaw: '',
        parseError: token && phone ? undefined : `第 ${index + 1} 行缺少 token 或手机号`
      } satisfies DraftRow;
    });

    setRows(parsed);
    setSelectedIds(parsed.filter((it) => !it.parseError).map((it) => it.id));
  };

  const selectableRows = useMemo(() => rows.filter((it) => !it.parseError), [rows]);

  const updateRow = (id: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const applyBatch = (selectedOnly: boolean) => {
    const selectedSet = new Set(selectedIds);
    setRows((prev) => prev.map((it) => {
      if (it.parseError) {
        return it;
      }
      if (selectedOnly && !selectedSet.has(it.id)) {
        return it;
      }
      return {
        ...it,
        is_enabled: batchType.is_enabled,
        is_online: batchType.is_online,
        is_new_user: batchType.is_new_user,
        is_platinum: batchType.is_platinum,
        dailyOrdersLeft: Math.max(0, Number(batchType.dailyOrdersLeft) || 0),
        corporateRaw: batchType.corporateRaw
      };
    }));
  };

  const submitImport = async (selectedOnly: boolean) => {
    setError('');
    setMessage('');
    const selectedSet = new Set(selectedIds);
    const candidates = rows.filter((it) => !it.parseError && (!selectedOnly || selectedSet.has(it.id)));
    if (candidates.length === 0) {
      setError('没有可导入的账号');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        items: candidates.map((it) => ({
          token: it.token,
          phone: it.phone,
          remark: it.remark || null,
          is_enabled: it.is_enabled,
          is_online: it.is_online,
          is_new_user: it.is_new_user,
          is_platinum: it.is_platinum,
          dailyOrdersLeft: Math.max(0, Number(it.dailyOrdersLeft) || 0),
          corporate_agreements: buildCorporateAgreements(it.corporateRaw)
        }))
      };
      const data = await fetchWithAuth('/api/pool/accounts/bulk-import', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setMessage(`导入完成：成功 ${data.success}，失败 ${data.failed}`);
      if (Array.isArray(data.results) && data.results.some((it: { ok: boolean }) => !it.ok)) {
        const failures = data.results
          .filter((it: { ok: boolean }) => !it.ok)
          .slice(0, 6)
          .map((it: { index: number; message: string }) => `第${Number(it.index) + 1}条: ${it.message}`)
          .join('\n');
        setError(failures);
      }
    } catch (err: any) {
      setError(err.message || '批量导入失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="批量导入号池账号">
        <div className="space-y-3">
          <div className="text-sm text-gray-600">每行格式：`token{delimiter || ','}手机号{delimiter || ','}备注(可选){delimiter || ','}可下间夜(可选)`</div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">分隔符</label>
            <input
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value)}
              className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
              placeholder="," />
            <button onClick={parseInput} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm">识别文本</button>
            <button onClick={() => { setRows([]); setSelectedIds([]); setRawText(''); setError(''); setMessage(''); }} className="px-3 py-1.5 rounded border border-gray-300 text-sm">清空</button>
          </div>
          <textarea
            rows={10}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm font-mono"
            placeholder="token_1,13800138000\ntoken_2,13900139000,测试账号"
          />
          {message && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">{message}</div>}
          {error && <pre className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 whitespace-pre-wrap">{error}</pre>}
        </div>
      </Card>

      <Card title="批量设置账号类型">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center">
          <label className="text-sm"><input type="checkbox" checked={batchType.is_new_user} onChange={(e) => setBatchType((p) => ({ ...p, is_new_user: e.target.checked }))} className="mr-2" />新客</label>
          <label className="text-sm"><input type="checkbox" checked={batchType.is_platinum} onChange={(e) => setBatchType((p) => ({ ...p, is_platinum: e.target.checked }))} className="mr-2" />铂金</label>
          <label className="text-sm"><input type="checkbox" checked={batchType.is_online} onChange={(e) => setBatchType((p) => ({ ...p, is_online: e.target.checked }))} className="mr-2" />在线</label>
          <label className="text-sm"><input type="checkbox" checked={batchType.is_enabled} onChange={(e) => setBatchType((p) => ({ ...p, is_enabled: e.target.checked }))} className="mr-2" />启用</label>
          <input type="number" min={0} value={batchType.dailyOrdersLeft} onChange={(e) => setBatchType((p) => ({ ...p, dailyOrdersLeft: Math.max(0, Number(e.target.value) || 0) }))} className="border border-gray-300 rounded px-2 py-1 text-sm" placeholder="可下间夜" />
          <input value={batchType.corporateRaw} onChange={(e) => setBatchType((p) => ({ ...p, corporateRaw: e.target.value }))} className="border border-gray-300 rounded px-2 py-1 text-sm md:col-span-2" placeholder="企业协议名，多个用逗号" />
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button onClick={() => applyBatch(true)} className="px-3 py-1.5 rounded border border-gray-300 text-sm">应用到已选行</button>
          <button onClick={() => applyBatch(false)} className="px-3 py-1.5 rounded border border-gray-300 text-sm">应用到全部行</button>
          <button disabled={loading} onClick={() => submitImport(true)} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm disabled:opacity-50">导入已选</button>
          <button disabled={loading} onClick={() => submitImport(false)} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">导入全部</button>
        </div>
      </Card>

      <Card title={`临时表格（${rows.length} 条）`}>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left py-2"><input
                  type="checkbox"
                  checked={selectableRows.length > 0 && selectedIds.length === selectableRows.length}
                  onChange={(e) => setSelectedIds(e.target.checked ? selectableRows.map((it) => it.id) : [])}
                /></th>
                <th className="text-left py-2">手机号</th>
                <th className="text-left py-2">Token</th>
                <th className="text-left py-2">类型</th>
                <th className="text-left py-2">可下间夜</th>
                <th className="text-left py-2">企业协议</th>
                <th className="text-left py-2">备注</th>
                <th className="text-left py-2">状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100 align-top">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      disabled={Boolean(row.parseError)}
                      checked={selectedIds.includes(row.id)}
                      onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, row.id] : prev.filter((it) => it !== row.id))}
                    />
                  </td>
                  <td className="py-2 font-mono">{row.phone || '-'}</td>
                  <td className="py-2 font-mono text-xs max-w-[280px] truncate" title={row.token}>{row.token || '-'}</td>
                  <td className="py-2 space-y-1">
                    <label className="block text-xs"><input type="checkbox" checked={row.is_new_user} onChange={(e) => updateRow(row.id, { is_new_user: e.target.checked })} className="mr-1" />新客</label>
                    <label className="block text-xs"><input type="checkbox" checked={row.is_platinum} onChange={(e) => updateRow(row.id, { is_platinum: e.target.checked })} className="mr-1" />铂金</label>
                    <label className="block text-xs"><input type="checkbox" checked={row.is_online} onChange={(e) => updateRow(row.id, { is_online: e.target.checked })} className="mr-1" />在线</label>
                    <label className="block text-xs"><input type="checkbox" checked={row.is_enabled} onChange={(e) => updateRow(row.id, { is_enabled: e.target.checked })} className="mr-1" />启用</label>
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={0}
                      value={row.dailyOrdersLeft}
                      onChange={(e) => updateRow(row.id, { dailyOrdersLeft: Math.max(0, Number(e.target.value) || 0) })}
                      className="border border-gray-300 rounded px-2 py-1 text-xs w-24"
                    />
                  </td>
                  <td className="py-2">
                    <input
                      value={row.corporateRaw}
                      onChange={(e) => updateRow(row.id, { corporateRaw: e.target.value })}
                      className="border border-gray-300 rounded px-2 py-1 text-xs w-52"
                      placeholder="多个用逗号"
                    />
                  </td>
                  <td className="py-2">
                    <input
                      value={row.remark}
                      onChange={(e) => updateRow(row.id, { remark: e.target.value })}
                      className="border border-gray-300 rounded px-2 py-1 text-xs w-40"
                      placeholder="备注"
                    />
                  </td>
                  <td className="py-2 text-xs">
                    {row.parseError ? <span className="text-red-600">{row.parseError}</span> : <span className="text-emerald-600">可导入</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="text-xs text-gray-400 py-4">暂无数据，先在上方粘贴文本后点“识别文本”</div>}
        </div>
      </Card>
    </div>
  );
};
