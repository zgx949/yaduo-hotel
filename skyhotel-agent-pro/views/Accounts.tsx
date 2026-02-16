
import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { MOCK_ACCOUNTS } from '../constants';
import { AccountStatus, AccountTier, HotelAccount } from '../types';

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
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [accounts, setAccounts] = useState<HotelAccount[]>(MOCK_ACCOUNTS);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  
  // Modal State
  const [selectedAccount, setSelectedAccount] = useState<HotelAccount | null>(null);

  // Stats
  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter(a => a.status === AccountStatus.ACTIVE).length;
  const todayCheckedIn = accounts.filter(a => isToday(a.lastExecution.checkIn)).length;

  // Filter Logic
  const filteredAccounts = accounts.filter(acc => {
    const matchType = filterType === 'ALL' || acc.tier === filterType;
    const matchSearch = acc.phone.includes(searchQuery) || 
                        (acc.corporateName && acc.corporateName.includes(searchQuery));
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
                <button className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 shadow-sm flex items-center gap-2">
                    + 添加/导入账号
                </button>
            </div>
        </div>

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
              {filteredAccounts.map(acc => {
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
                        {acc.corporateName && (
                            <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                                🏢 {acc.corporateName}
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
                        <button 
                            onClick={() => setSelectedAccount(acc)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                            查看日报
                        </button>
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
    </div>
  );
};
