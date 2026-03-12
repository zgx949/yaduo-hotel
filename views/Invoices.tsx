import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { InvoiceRecordListItem, InvoiceTemplate } from '../types';

const TOKEN_KEY = 'skyhotel_auth_token';

const defaultTemplateForm = {
  accountId: '',
  invoiceId: '',
  invoiceName: '',
  invoiceType: '13',
  invoiceTitleType: '2',
  taxNo: '',
  address: '',
  telephone: '',
  bank: '',
  account: '',
  email: '',
  remark: ''
};

type RemoteTemplateCandidate = {
  invoicetitle?: string;
  taxpayernumber?: string;
  regaddress?: string;
  companytelephone?: string;
  bankaddress?: string;
  bankcard?: string;
};

export const Invoices: React.FC = () => {
  const [records, setRecords] = useState<InvoiceRecordListItem[]>([]);
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 20, totalPages: 1, hasMore: false });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState(defaultTemplateForm);
  const [remoteKeyword, setRemoteKeyword] = useState('');
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteResults, setRemoteResults] = useState<RemoteTemplateCandidate[]>([]);

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
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || '请求失败');
    }
    return data;
  };

  const loadRecords = async () => {
    setLoadingRecords(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (search.trim()) {
        params.set('search', search.trim());
      }
      if (stateFilter !== 'ALL') {
        params.set('state', stateFilter);
      }
      const data = await fetchWithAuth(`/api/invoices/records?${params.toString()}`);
      const nextItems = Array.isArray(data.items) ? data.items : [];
      const nextMeta = data.meta || {};
      setRecords(nextItems);
      setMeta({
        total: Number(nextMeta.total || 0),
        page: Number(nextMeta.page || page),
        pageSize: Number(nextMeta.pageSize || pageSize),
        totalPages: Number(nextMeta.totalPages || 1),
        hasMore: Boolean(nextMeta.hasMore)
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载开票记录失败');
    } finally {
      setLoadingRecords(false);
    }
  };

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await fetchWithAuth('/api/invoices/templates?page=1&pageSize=200');
      setTemplates(Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [page, pageSize, stateFilter]);

  useEffect(() => {
    loadTemplates().catch(() => undefined);
  }, []);

  const doSearch = async () => {
    if (page !== 1) {
      setPage(1);
      return;
    }
    await loadRecords();
  };

  const searchRemoteTemplates = async () => {
    const keyword = remoteKeyword.trim();
    if (!keyword) {
      setRemoteResults([]);
      return;
    }
    setRemoteLoading(true);
    setError('');
    try {
      const data = await fetchWithAuth('/api/invoices/templates/search-remote', {
        method: 'POST',
        body: JSON.stringify({
          titleOrNumber: keyword,
          accountId: templateForm.accountId || undefined
        })
      });
      setRemoteResults(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '远程抬头搜索失败');
    } finally {
      setRemoteLoading(false);
    }
  };

  const applyRemoteCandidate = (it: RemoteTemplateCandidate) => {
    setTemplateForm((prev) => ({
      ...prev,
      invoiceName: it.invoicetitle || prev.invoiceName,
      taxNo: it.taxpayernumber || prev.taxNo,
      address: it.regaddress || prev.address,
      telephone: it.companytelephone || prev.telephone,
      bank: it.bankaddress || prev.bank,
      account: it.bankcard || prev.account
    }));
    setNotice('已填充抬头信息，请补充邮箱后保存模板');
  };

  const saveTemplate = async () => {
    setSavingTemplate(true);
    setError('');
    setNotice('');
    try {
      await fetchWithAuth('/api/invoices/templates', {
        method: 'POST',
        body: JSON.stringify({
          accountId: templateForm.accountId || undefined,
          invoiceId: templateForm.invoiceId ? Number(templateForm.invoiceId) : undefined,
          invoiceName: templateForm.invoiceName,
          invoiceType: Number(templateForm.invoiceType),
          invoiceTitleType: Number(templateForm.invoiceTitleType),
          taxNo: templateForm.taxNo || undefined,
          address: templateForm.address || undefined,
          telephone: templateForm.telephone || undefined,
          bank: templateForm.bank || undefined,
          account: templateForm.account || undefined,
          email: templateForm.email || undefined,
          remark: templateForm.remark || undefined
        })
      });
      setNotice('模板保存成功');
      setTemplateModalOpen(false);
      setTemplateForm(defaultTemplateForm);
      setRemoteKeyword('');
      setRemoteResults([]);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存模板失败');
    } finally {
      setSavingTemplate(false);
    }
  };

  const stateLabel = (state: string) => {
    if (state === 'ISSUED') return '已开票';
    if (state === 'PRESET') return '已预设';
    if (state === 'FAILED') return '开票失败';
    return '开票中';
  };

  const stateClass = (state: string) => {
    if (state === 'ISSUED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (state === 'PRESET') return 'bg-sky-50 text-sky-700 border-sky-200';
    if (state === 'FAILED') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  const templateSummary = useMemo(() => `${templates.length} 个模板`, [templates.length]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">发票管理</h2>
          <p className="text-gray-500 text-sm mt-1">这里主要查看已开票记录；发票模板通过弹窗新增并支持远程抬头搜索自动填充。</p>
        </div>
        <button
          onClick={() => setTemplateModalOpen(true)}
          className="px-3 py-2 text-sm rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700"
        >
          新增模板
        </button>
      </div>

      {error && <div className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>}
      {notice && <div className="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">{notice}</div>}

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索：酒店/主订单号/亚朵订单号/开票抬头"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
          <select
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            <option value="ALL">全部开票状态</option>
            <option value="ISSUED">已开票</option>
            <option value="PENDING">开票中</option>
            <option value="FAILED">开票失败</option>
          </select>
          <button
            onClick={doSearch}
            disabled={loadingRecords}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingRecords ? '加载中...' : '筛选'}
          </button>
          <div className="md:col-span-2 text-sm text-gray-500 flex items-center justify-end">
            记录总数 {meta.total} | 模板 {templateSummary}
          </div>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-medium">
              <tr>
                <th className="px-4 py-3">开票状态</th>
                <th className="px-4 py-3">开票金额</th>
                <th className="px-4 py-3">酒店</th>
                <th className="px-4 py-3">主订单号</th>
                <th className="px-4 py-3">亚朵订单号</th>
                <th className="px-4 py-3">发票抬头</th>
                <th className="px-4 py-3">invoiceId</th>
                <th className="px-4 py-3">邮箱</th>
                <th className="px-4 py-3">开票时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((it) => (
                <tr key={it.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded border text-xs ${stateClass(it.state)}`}>{stateLabel(it.state)}</span>
                  </td>
                  <td className="px-4 py-3">{it.order?.currency || 'CNY'} {it.splitItem?.amount ?? '-'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{it.order?.hotelName || '-'}</div>
                    <div className="text-xs text-gray-500">入住人: {it.order?.customerName || '-'}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{it.order?.bizOrderNo || '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{it.splitItem?.atourOrderId || it.orderId || '-'}</td>
                  <td className="px-4 py-3">{it.invoiceName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{it.invoiceId}</td>
                  <td className="px-4 py-3">{it.email || '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{it.issuedAt ? new Date(it.issuedAt).toLocaleString() : '-'}</td>
                </tr>
              ))}
              {!loadingRecords && records.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400">暂无开票记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="text-gray-500">第 {meta.page} / {meta.totalPages} 页</div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) || 20);
                setPage(1);
              }}
              className="px-2 py-1 rounded border border-gray-200"
            >
              {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}/页</option>)}
            </select>
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={meta.page <= 1}
              className="px-3 py-1.5 rounded border border-gray-200 disabled:opacity-40"
            >上一页</button>
            <button
              onClick={() => setPage((prev) => (meta.hasMore ? prev + 1 : prev))}
              disabled={!meta.hasMore}
              className="px-3 py-1.5 rounded border border-gray-200 disabled:opacity-40"
            >下一页</button>
          </div>
        </div>
      </Card>

      {templateModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-2 sm:p-4 overflow-x-hidden">
          <div className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-4xl rounded-xl bg-white border border-gray-200 shadow-xl p-3 sm:p-4 space-y-4 max-h-[92vh] overflow-y-auto mx-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">新增发票模板</h3>
                <p className="text-sm text-gray-600 mt-1">可先搜索企业抬头自动填充税号/开户地址/电话/开户行等字段，再保存模板。</p>
              </div>
              <button
                onClick={() => setTemplateModalOpen(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200"
              >
                关闭
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                value={templateForm.accountId}
                onChange={(e) => setTemplateForm((prev) => ({ ...prev, accountId: e.target.value }))}
                placeholder="账号ID(可选)"
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
              <input
                value={remoteKeyword}
                onChange={(e) => setRemoteKeyword(e.target.value)}
                placeholder="远程搜索抬头/税号"
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm md:col-span-2"
              />
              <button
                onClick={searchRemoteTemplates}
                disabled={remoteLoading}
                className="px-3 py-2 text-sm rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 disabled:opacity-50"
              >
                {remoteLoading ? '搜索中...' : '搜索并填充'}
              </button>
            </div>

            {remoteResults.length > 0 && (
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="max-h-56 overflow-auto divide-y divide-gray-100">
                  {remoteResults.map((it, idx) => (
                    <button
                      key={`${it.invoicetitle || 't'}-${it.taxpayernumber || idx}-${idx}`}
                      type="button"
                      onClick={() => applyRemoteCandidate(it)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    >
                      <div className="text-sm font-medium text-gray-900 break-all">{it.invoicetitle || '-'}</div>
                      <div className="text-xs text-gray-500 break-all">税号: {it.taxpayernumber || '-'} | 电话: {it.companytelephone || '-'}</div>
                      <div className="text-xs text-gray-500 break-all">地址: {it.regaddress || '-'} | 开户行: {it.bankaddress || '-'}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={templateForm.invoiceId} onChange={(e) => setTemplateForm((prev) => ({ ...prev, invoiceId: e.target.value }))} placeholder="invoiceId(已知可直接填)" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <input value={templateForm.invoiceName} onChange={(e) => setTemplateForm((prev) => ({ ...prev, invoiceName: e.target.value }))} placeholder="发票抬头" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <input value={templateForm.taxNo} onChange={(e) => setTemplateForm((prev) => ({ ...prev, taxNo: e.target.value }))} placeholder="税号" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <input value={templateForm.address} onChange={(e) => setTemplateForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="注册地址" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <input value={templateForm.telephone} onChange={(e) => setTemplateForm((prev) => ({ ...prev, telephone: e.target.value }))} placeholder="公司电话" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <input value={templateForm.bank} onChange={(e) => setTemplateForm((prev) => ({ ...prev, bank: e.target.value }))} placeholder="开户行" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <input value={templateForm.account} onChange={(e) => setTemplateForm((prev) => ({ ...prev, account: e.target.value }))} placeholder="银行账号" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <input value={templateForm.email} onChange={(e) => setTemplateForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="接收邮箱" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
              <textarea value={templateForm.remark} onChange={(e) => setTemplateForm((prev) => ({ ...prev, remark: e.target.value }))} rows={1} placeholder="备注" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setTemplateForm(defaultTemplateForm);
                  setRemoteKeyword('');
                  setRemoteResults([]);
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200"
              >
                重置
              </button>
              <button
                onClick={saveTemplate}
                disabled={savingTemplate}
                className="px-3 py-1.5 text-sm rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 disabled:opacity-50"
              >
                {savingTemplate ? '保存中...' : '保存模板'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <div className="text-sm text-gray-500 mb-2">模板列表（用于开票时选择）{loadingTemplates ? ' · 加载中...' : ''}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-medium">
              <tr>
                <th className="px-4 py-2">invoiceId</th>
                <th className="px-4 py-2">抬头</th>
                <th className="px-4 py-2">税号</th>
                <th className="px-4 py-2">邮箱</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map((tpl) => (
                <tr key={tpl.id}>
                  <td className="px-4 py-2 font-mono text-xs">{tpl.invoiceId}</td>
                  <td className="px-4 py-2">{tpl.invoiceName}</td>
                  <td className="px-4 py-2">{tpl.taxNo || '-'}</td>
                  <td className="px-4 py-2">{tpl.email || '-'}</td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">暂无模板</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
