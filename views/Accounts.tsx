
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/ui/Card';
import { MOCK_ACCOUNTS } from '../constants';
import { AccountStatus, AccountTier, PoolAccount } from '../types';

// Helper to format date
const formatDate = (isoString?: string) => {
  if (!isoString) return '从未';
  const date = new Date(isoString);
  return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

// Check if date is today
const isToday = (isoString?: string) => {
  if (!isoString) return false;
  const date = new Date(isoString);
  const today = new Date();
  return date.getDate() === today.getDate() && 
         date.getMonth() === today.getMonth() && 
         date.getFullYear() === today.getFullYear();
};

const TIER_LABELS: Record<string, { label: string, color: string }> = {
  [AccountTier.NEW_USER]: { label: '新用户', color: 'bg-green-100 text-green-800' },
  [AccountTier.NORMAL]: { label: '普通', color: 'bg-gray-100 text-gray-800' },
  [AccountTier.GOLD]: { label: '金卡', color: 'bg-yellow-100 text-yellow-800' },
  [AccountTier.PLATINUM]: { label: '白金', color: 'bg-purple-100 text-purple-800' },
  [AccountTier.CO_PLATINUM]: { label: '联合白金', color: 'bg-indigo-100 text-indigo-800' },
  [AccountTier.CORPORATE]: { label: '企业协议', color: 'bg-blue-100 text-blue-800' },
  [AccountTier.DIAMOND]: { label: '钻石', color: 'bg-slate-800 text-white' },
};

const STATUS_LABELS: Record<string, { label: string, color: string, dot: string }> = {
  [AccountStatus.ACTIVE]: { label: '在线', color: 'text-green-600', dot: 'bg-green-500' },
  [AccountStatus.OFFLINE]: { label: '离线', color: 'text-gray-500', dot: 'bg-gray-400' },
  [AccountStatus.RESTRICTED]: { label: '受限', color: 'text-amber-600', dot: 'bg-amber-500' },
  [AccountStatus.BLOCKED]: { label: '封禁', color: 'text-red-600', dot: 'bg-red-500' },
};

const COUPON_CONFIG = {
  breakfast: { label: '早', fullLabel: '早餐券', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  upgrade: { label: '升', fullLabel: '房型升级券', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  lateCheckout: { label: '延', fullLabel: '延迟退房券', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  slippers: { label: '鞋', fullLabel: '拖鞋券', color: 'bg-gray-50 text-gray-600 border-gray-200' },
};

export const Accounts: React.FC = () => {
  const TOKEN_KEY = 'skyhotel_auth_token';
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [accounts, setAccounts] = useState<PoolAccount[]>(MOCK_ACCOUNTS as unknown as PoolAccount[]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [agreementQuery, setAgreementQuery] = useState('');
  const [agreementDropdownOpen, setAgreementDropdownOpen] = useState(false);
  const [corporateOptions, setCorporateOptions] = useState<string[]>([]);
  const agreementBoxRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState({
    phone: '',
    token: '',
    remark: '',
    is_online: true,
    is_platinum: false,
    is_corp_user: false,
    is_new_user: false,
    corporate_agreements: [] as string[],
    breakfast_coupons: 0,
    room_upgrade_coupons: 0,
    late_checkout_coupons: 0
  });
  
  // Modal State
  const [selectedAccount, setSelectedAccount] = useState<PoolAccount | null>(null);

  const getAuthToken = () => localStorage.getItem(TOKEN_KEY);

  const fetchWithAuth = async (url: string, options?: RequestInit) => {
    const token = getAuthToken();
    if (!token) {
      throw new Error('登录已过期，请重新登录');
    }

    const headers = new Headers(options?.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (options?.body && !headers.get('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || '请求失败');
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  };

  const loadAccounts = async () => {
    setLoadingList(true);
    setError('');
    try {
      const data = await fetchWithAuth('/api/pool/accounts');
      setAccounts(data.items || []);
    } catch (err: any) {
      setError(err.message || '加载账号池失败，已回退到本地数据');
      setAccounts(MOCK_ACCOUNTS as unknown as PoolAccount[]);
    } finally {
      setLoadingList(false);
    }
  };

  const loadCorporateOptions = async () => {
    try {
      const data = await fetchWithAuth('/api/pool/corporate-agreements');
      const names = (data.items || []).map((it: { name: string }) => it.name).filter(Boolean);
      setCorporateOptions(names);
    } catch {
      setCorporateOptions((prev) => prev);
    }
  };

  useEffect(() => {
    loadAccounts();
    loadCorporateOptions();
  }, []);

  useEffect(() => {
    if (!isFormOpen) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      if (!agreementBoxRef.current) {
        return;
      }
      if (!agreementBoxRef.current.contains(event.target as Node)) {
        setAgreementDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [isFormOpen]);

  const knownCorporateNames = useMemo(() => {
    const fromAccounts = accounts.flatMap((it) => (it.corporate_agreements || []).map((corp) => corp.name));
    const merged = [...corporateOptions, ...fromAccounts];
    return Array.from(new Set(merged.map((it) => it.trim()).filter(Boolean)));
  }, [accounts, corporateOptions]);

  const agreementSuggestions = useMemo(() => {
    const query = agreementQuery.trim().toLowerCase();
    return knownCorporateNames
      .filter((name) => !form.corporate_agreements.includes(name))
      .filter((name) => !query || name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [knownCorporateNames, form.corporate_agreements, agreementQuery]);

  const addCorporateAgreement = (rawName: string) => {
    const name = rawName.trim();
    if (!name || form.corporate_agreements.includes(name)) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      is_corp_user: true,
      corporate_agreements: [...prev.corporate_agreements, name]
    }));
    setCorporateOptions((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setAgreementQuery('');
    setAgreementDropdownOpen(false);
  };

  const removeCorporateAgreement = (name: string) => {
    setForm((prev) => {
      const next = prev.corporate_agreements.filter((it) => it !== name);
      return {
        ...prev,
        corporate_agreements: next,
        is_corp_user: next.length > 0 ? true : prev.is_corp_user
      };
    });
  };

  // Stats
  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter(a => a.status === AccountStatus.ACTIVE).length;
  const todayCheckedIn = accounts.filter(a => isToday(a.lastExecution.checkIn)).length;

  // Filter Logic
  const filteredAccounts = accounts.filter(acc => {
    const matchType = filterType === 'ALL' || acc.tier === filterType;
    const matchSearch = acc.phone.includes(searchQuery) || 
                        (acc.corporateName && acc.corporateName.includes(searchQuery)) ||
                        (acc.corporate_agreements || []).some((corp) => corp.name.includes(searchQuery));
    return matchType && matchSearch;
  });

  const handleManualAction = (id: string, action: 'checkIn' | 'lottery' | 'scan' | 'refresh') => {
    setLoadingAction(`${id}-${action}`);
    setTimeout(() => {
        setAccounts(prev => prev.map(acc => {
            if (acc.id !== id) return acc;
            
            const now = new Date().toISOString();
            if (action === 'refresh') {
                const newStatus = Math.random() > 0.2 ? AccountStatus.ACTIVE : AccountStatus.OFFLINE;
                return { ...acc, status: newStatus };
            }
            
            let updatedCoupons = acc.coupons;
            let resultMessage = '';

            // Generate Result Logic
            if (action === 'checkIn') {
                const points = Math.floor(Math.random() * 50) + 10;
                resultMessage = `签到成功 +${points}积分`;
            } else if (action === 'lottery') {
                const win = Math.random() > 0.7;
                if (win) {
                    updatedCoupons = { ...acc.coupons, breakfast: acc.coupons.breakfast + 1 };
                    resultMessage = '中奖：早餐券 x1';
                } else {
                    resultMessage = '很遗憾，未中奖';
                }
            } else if (action === 'scan') {
                const count = Math.floor(Math.random() * 3);
                if (count > 0) {
                     updatedCoupons = { ...acc.coupons, slippers: acc.coupons.slippers + count };
                     resultMessage = `扫描完成，发现 ${count} 张新券`;
                } else {
                     resultMessage = '扫描完毕，无新增';
                }
            }

            return {
                ...acc,
                coupons: updatedCoupons,
                lastExecution: {
                    ...acc.lastExecution,
                    [action]: now
                },
                lastResult: {
                    ...acc.lastResult,
                    [action]: resultMessage
                }
            };
        }));
        setLoadingAction(null);
    }, 800);
  };

  const handleBulkAction = (action: 'checkIn' | 'refresh') => {
      if (!window.confirm(`确定要对当前列表显示的 ${filteredAccounts.length} 个账号执行批量操作吗？`)) return;
      alert(`已将 ${filteredAccounts.length} 个任务加入后台队列，请稍后查看状态。`);
  };

  const resetForm = () => {
    setEditingAccountId(null);
    setFormError('');
    setForm({
      phone: '',
      token: '',
      remark: '',
      is_online: true,
      is_platinum: false,
      is_corp_user: false,
      is_new_user: false,
      corporate_agreements: [],
      breakfast_coupons: 0,
      room_upgrade_coupons: 0,
      late_checkout_coupons: 0
    });
    setAgreementQuery('');
    setAgreementDropdownOpen(false);
  };

  const handleCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleEdit = (account: PoolAccount) => {
    setEditingAccountId(account.id);
    setFormError('');
    setForm({
      phone: account.phone,
      token: account.token || '',
      remark: account.remark || '',
      is_online: account.is_online,
      is_platinum: account.is_platinum,
      is_corp_user: account.is_corp_user,
      is_new_user: account.is_new_user,
      corporate_agreements: (account.corporate_agreements || []).map((it) => it.name),
      breakfast_coupons: account.breakfast_coupons,
      room_upgrade_coupons: account.room_upgrade_coupons,
      late_checkout_coupons: account.late_checkout_coupons
    });
    setAgreementQuery('');
    setAgreementDropdownOpen(false);
    setIsFormOpen(true);
  };

  const handleDelete = async (account: PoolAccount) => {
    if (!window.confirm(`确认删除账号 ${account.phone} 吗？`)) {
      return;
    }

    try {
      await fetchWithAuth(`/api/pool/accounts/${account.id}`, { method: 'DELETE' });
      setAccounts((prev) => prev.filter((it) => it.id !== account.id));
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone || !form.token) {
      setFormError('手机号和 token 必填');
      return;
    }

    setSavingForm(true);
    setFormError('');

    try {
      const payload = {
        ...form,
        is_corp_user: form.corporate_agreements.length > 0 ? true : form.is_corp_user,
        corporate_agreements: form.corporate_agreements,
        breakfast_coupons: Number(form.breakfast_coupons),
        room_upgrade_coupons: Number(form.room_upgrade_coupons),
        late_checkout_coupons: Number(form.late_checkout_coupons)
      };

      if (editingAccountId) {
        const updated = await fetchWithAuth(`/api/pool/accounts/${editingAccountId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        setAccounts((prev) => prev.map((it) => (it.id === editingAccountId ? updated : it)));
      } else {
        const created = await fetchWithAuth('/api/pool/accounts', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setAccounts((prev) => [created, ...prev]);
      }

      setIsFormOpen(false);
      resetForm();
    } catch (err: any) {
      setFormError(err.message || '保存失败');
    } finally {
      setSavingForm(false);
    }
  };

  // --- Modal Content ---
  const renderReportModal = () => {
      if (!selectedAccount) return null;
      
      const { lastExecution, lastResult, coupons } = selectedAccount;

      return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedAccount(null)}>
              <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-fadeIn" onClick={e => e.stopPropagation()}>
                  <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                      <div>
                          <h3 className="font-bold text-lg">{selectedAccount.phone}</h3>
                          <p className="text-xs text-slate-400">今日执行日报</p>
                      </div>
                      <button onClick={() => setSelectedAccount(null)} className="text-white/50 hover:text-white">✕</button>
                  </div>

                  <div className="p-4 space-y-6">
                      {/* Daily Tasks Report */}
                      <div>
                          <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                              📋 今日执行结果
                          </h4>
                          <div className="space-y-3">
                              {[
                                  { key: 'checkIn', label: '每日签到', icon: '📅' },
                                  { key: 'lottery', label: '每日抽奖', icon: '🎁' },
                                  { key: 'scan', label: '优惠券扫描', icon: '🔍' }
                              ].map(task => {
                                  const key = task.key as keyof typeof lastExecution;
                                  const time = lastExecution[key];
                                  const result = selectedAccount.lastResult[key as keyof typeof selectedAccount.lastResult];
                                  const doneToday = isToday(time);

                                  return (
                                      <div key={task.key} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100">
                                          <div className="flex items-center gap-3">
                                              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-lg shadow-sm">
                                                  {task.icon}
                                              </div>
                                              <div>
                                                  <div className="text-sm font-medium text-gray-900">{task.label}</div>
                                                  <div className="text-xs text-gray-400">
                                                      {doneToday ? `执行时间: ${formatDate(time).split(' ')[1]}` : '今日未执行'}
                                                  </div>
                                              </div>
                                          </div>
                                          <div className="text-right">
                                              {doneToday ? (
                                                  <span className={`text-xs font-bold ${result?.includes('未') || result?.includes('遗憾') ? 'text-gray-500' : 'text-green-600'}`}>
                                                      {result || '执行成功'}
                                                  </span>
                                              ) : (
                                                  <button 
                                                      onClick={() => handleManualAction(selectedAccount.id, key as any)}
                                                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                                  >
                                                      立即运行
                                                  </button>
                                              )}
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>

                      {/* Full Coupon Wallet */}
                      <div>
                          <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                              🎫 当前优惠券资产
                          </h4>
                          <div className="grid grid-cols-2 gap-3">
                              {Object.entries(coupons).map(([type, count]) => {
                                  const config = COUPON_CONFIG[type as keyof typeof COUPON_CONFIG];
                                  return (
                                      <div key={type} className={`p-3 rounded-lg border flex justify-between items-center ${config.color.replace('bg-', 'bg-opacity-50 ')} bg-white`}>
                                          <div>
                                              <div className="text-xs text-gray-500">{config.fullLabel}</div>
                                              <div className="font-bold text-lg text-gray-800">{count} <span className="text-xs font-normal text-gray-400">张</span></div>
                                          </div>
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${config.color}`}>
                                              {config.label}
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                          <div className="mt-3 bg-blue-50 p-2 rounded text-xs text-blue-700 text-center">
                              当前积分余额: <span className="font-bold">{selectedAccount.points.toLocaleString()}</span>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  const renderFormModal = () => {
    if (!isFormOpen) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsFormOpen(false)}>
        <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">{editingAccountId ? '编辑号池账号' : '新增号池账号'}</h3>
            <button onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-gray-700">✕</button>
          </div>

          <form onSubmit={handleSubmitForm} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">手机号</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="13800000000"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">登录 Token</label>
                <input
                  value={form.token}
                  onChange={(e) => setForm((prev) => ({ ...prev, token: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="token_xxx"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">备注</label>
              <input
                value={form.remark}
                onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="备注"
              />
            </div>

            <div className="grid grid-cols-4 gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.is_online} onChange={(e) => setForm((prev) => ({ ...prev, is_online: e.target.checked }))} />在线</label>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.is_new_user} onChange={(e) => setForm((prev) => ({ ...prev, is_new_user: e.target.checked }))} />新用户</label>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.is_platinum} onChange={(e) => setForm((prev) => ({ ...prev, is_platinum: e.target.checked }))} />铂金</label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_corp_user}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      is_corp_user: e.target.checked,
                      corporate_agreements: e.target.checked ? prev.corporate_agreements : []
                    }))
                  }
                />
                企业
              </label>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">企业协议</label>
              <div ref={agreementBoxRef} className="relative">
                <div className="w-full border border-gray-300 rounded-lg px-2 py-2 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {form.corporate_agreements.map((name) => (
                      <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100 text-xs">
                        {name}
                        <button
                          type="button"
                          onClick={() => removeCorporateAgreement(name)}
                          className="text-blue-500 hover:text-blue-700"
                          aria-label={`移除${name}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>

                  <input
                    value={agreementQuery}
                    onFocus={() => setAgreementDropdownOpen(true)}
                    onChange={(e) => {
                      setAgreementQuery(e.target.value);
                      setAgreementDropdownOpen(true);
                      if (!form.is_corp_user) {
                        setForm((prev) => ({ ...prev, is_corp_user: true }));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const firstSuggestion = agreementSuggestions[0];
                        const target = agreementQuery.trim() || firstSuggestion;
                        if (target) {
                          addCorporateAgreement(target);
                        }
                      } else if (e.key === 'Backspace' && !agreementQuery && form.corporate_agreements.length > 0) {
                        e.preventDefault();
                        removeCorporateAgreement(form.corporate_agreements[form.corporate_agreements.length - 1]);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setAgreementDropdownOpen(false);
                      }
                    }}
                    className="w-full px-1 py-1 text-sm outline-none"
                    placeholder="搜索并添加企业协议，例如：阿里巴巴"
                  />
                </div>

                {agreementDropdownOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                    {agreementSuggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => addCorporateAgreement(name)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                      >
                        {name}
                      </button>
                    ))}

                    {agreementQuery.trim() && !knownCorporateNames.includes(agreementQuery.trim()) && (
                      <button
                        type="button"
                        onClick={() => addCorporateAgreement(agreementQuery.trim())}
                        className="w-full text-left px-3 py-2 text-sm border-t border-gray-100 text-emerald-700 hover:bg-emerald-50"
                      >
                        + 新增协议：{agreementQuery.trim()}
                      </button>
                    )}

                    {!agreementSuggestions.length && !(agreementQuery.trim() && !knownCorporateNames.includes(agreementQuery.trim())) && (
                      <div className="px-3 py-2 text-xs text-gray-400">没有可选项</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">早餐券</label>
                <input type="number" min={0} value={form.breakfast_coupons} onChange={(e) => setForm((prev) => ({ ...prev, breakfast_coupons: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">升房券</label>
                <input type="number" min={0} value={form.room_upgrade_coupons} onChange={(e) => setForm((prev) => ({ ...prev, room_upgrade_coupons: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">延迟退房券</label>
                <input type="number" min={0} value={form.late_checkout_coupons} onChange={(e) => setForm((prev) => ({ ...prev, late_checkout_coupons: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            {formError && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{formError}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">取消</button>
              <button type="submit" disabled={savingForm} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {savingForm ? '保存中...' : editingAccountId ? '保存修改' : '创建账号'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
       {/* Header & Stats */}
       <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-bold text-gray-800">账号池管理</h2>
                <p className="text-gray-500 text-sm">当前共 {totalAccounts} 个账号，{activeAccounts} 个在线。今日已签到: {todayCheckedIn}</p>
            </div>
            <div className="flex gap-2">
                <button 
                  onClick={loadAccounts}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
                >
                    ↻ 刷新列表
                </button>
                <button 
                  onClick={() => handleBulkAction('refresh')}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
                >
                    🔄 批量检测状态
                </button>
                <button 
                  onClick={() => handleBulkAction('checkIn')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm flex items-center gap-2"
                >
                    📅 批量一键签到
                </button>
                <button 
                  onClick={handleCreate}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 shadow-sm flex items-center gap-2"
                >
                    + 添加/导入账号
                </button>
            </div>
        </div>

        {error && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
                <input 
                    type="text" 
                    placeholder="搜索手机号 / 企业名称" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64"
                />
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-1">
                <button 
                    onClick={() => setFilterType('ALL')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        filterType === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >全部</button>
                {Object.keys(TIER_LABELS).map(tier => (
                    <button 
                        key={tier}
                        onClick={() => setFilterType(tier)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            filterType === tier ? TIER_LABELS[tier].color : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                    >
                        {TIER_LABELS[tier].label}
                    </button>
                ))}
            </div>
        </div>
      </div>

      {/* Data Table */}
      <Card className="flex-1 overflow-hidden flex flex-col p-0">
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-3 whitespace-nowrap">账号信息</th>
                <th className="px-6 py-3 whitespace-nowrap">类型/权益</th>
                <th className="px-6 py-3 whitespace-nowrap">当前状态</th>
                <th className="px-6 py-3 whitespace-nowrap">资源 / 卡券</th>
                <th className="px-6 py-3 whitespace-nowrap text-center">今日签到</th>
                <th className="px-6 py-3 whitespace-nowrap text-center">今日抽奖</th>
                <th className="px-6 py-3 whitespace-nowrap text-center">优惠券扫描</th>
                <th className="px-6 py-3 whitespace-nowrap text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingList ? (
                  <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-400">加载中...</td>
                  </tr>
              ) : filteredAccounts.map(acc => {
                  const statusInfo = STATUS_LABELS[acc.status];
                  const tierInfo = TIER_LABELS[acc.tier];

                  return (
                    <tr key={acc.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-mono font-medium text-gray-900">{acc.phone}</div>
                        <div className="text-xs text-gray-400">ID: {acc.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tierInfo.color}`}>
                          {tierInfo.label}
                        </span>
                        {(acc.corporate_agreements || []).length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                                {(acc.corporate_agreements || []).map((corp) => (
                                  <span key={corp.id} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                                    🏢 {corp.name}
                                  </span>
                                ))}
                            </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <span className={`w-2 h-2 rounded-full ${statusInfo.dot}`}></span>
                           <span className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                           <button 
                             onClick={() => handleManualAction(acc.id, 'refresh')}
                             className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-all"
                             title="立即检测状态"
                           >
                              <svg className={`w-4 h-4 ${loadingAction === `${acc.id}-refresh` ? 'animate-spin text-blue-600' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                           </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded -ml-1" onClick={() => setSelectedAccount(acc)}>
                            <span className="text-xs font-medium text-gray-600">🪙 {acc.points.toLocaleString()} 积分</span>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(acc.coupons).map(([type, count]) => {
                                if (count === 0) return null;
                                const config = COUPON_CONFIG[type as keyof typeof COUPON_CONFIG];
                                return (
                                  <div key={type} className={`px-1.5 py-0.5 rounded border text-[10px] font-medium flex items-center gap-1 ${config.color}`} title={config.fullLabel}>
                                    <span>{config.label}</span>
                                    <span>{count}</span>
                                  </div>
                                );
                              })}
                              {Object.values(acc.coupons).every(c => c === 0) && (
                                <span className="text-[10px] text-gray-400">无卡券</span>
                              )}
                            </div>
                        </div>
                      </td>
                      
                      {/* Automation Status Columns */}
                      {['checkIn', 'lottery', 'scan'].map((task) => {
                          const taskKey = task as keyof typeof acc.lastExecution;
                          const time = acc.lastExecution[taskKey];
                          const doneToday = isToday(time);
                          const loading = loadingAction === `${acc.id}-${task}`;

                          return (
                            <td key={task} className="px-6 py-4 text-center">
                                <div className="flex flex-col items-center justify-center gap-1">
                                    {doneToday ? (
                                        <button 
                                            onClick={() => setSelectedAccount(acc)}
                                            className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center border border-green-100 hover:bg-green-100 hover:scale-110 transition-all" 
                                            title="点击查看执行结果"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleManualAction(acc.id, taskKey as any)}
                                            disabled={loading}
                                            className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                                            title="点击立即运行"
                                        >
                                            {loading ? (
                                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            ) : (
                                                <span className="text-xs">▶</span>
                                            )}
                                        </button>
                                    )}
                                    <span className="text-[10px] text-gray-400 scale-90">
                                        {doneToday ? formatDate(time).split(' ')[1] : '未执行'}
                                    </span>
                                </div>
                            </td>
                          );
                      })}

                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-3">
                          <button 
                              onClick={() => setSelectedAccount(acc)}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                              查看日报
                          </button>
                          <button
                              onClick={() => handleEdit(acc)}
                              className="text-emerald-600 hover:text-emerald-800 text-xs font-medium"
                          >
                              编辑
                          </button>
                          <button
                              onClick={() => handleDelete(acc)}
                              className="text-red-600 hover:text-red-800 text-xs font-medium"
                          >
                              删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
              })}
              
              {filteredAccounts.length === 0 && (
                  <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                          没有找到匹配的账号。
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 flex justify-between items-center">
            <span>显示 {filteredAccounts.length} 条记录</span>
            <div className="flex gap-2">
                <button className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50" disabled>上一页</button>
                <button className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-100">下一页</button>
            </div>
        </div>
      </Card>
      
      {/* Detail Modal */}
      {renderReportModal()}
      {renderFormModal()}
    </div>
  );
};
