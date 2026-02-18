import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { OrderGroup, OrderSplitItem, SystemUser } from '../types';

interface OrdersProps {
  currentUser?: SystemUser | null;
}

const TOKEN_KEY = 'skyhotel_auth_token';

const statusText = (status: string) => {
  const dict: Record<string, string> = {
    PROCESSING: '处理中',
    CONFIRMED: '已确认',
    CANCELLED: '已取消',
    COMPLETED: '已完成',
    FAILED: '失败',
    UNPAID: '未支付',
    PAID: '已支付',
    PARTIAL: '部分支付'
  };
  return dict[status] || status;
};

const executionText = (status: string) => {
  const dict: Record<string, string> = {
    PLAN_PENDING: '待确认',
    QUEUED: '待下单',
    SUBMITTING: '下单中',
    WAIT_CONFIRM: '待确认结果',
    ORDERED: '已下单',
    DONE: '已下单',
    FAILED: '执行失败',
    CANCELLED: '已取消'
  };
  return dict[status] || status;
};

const statusClass = (status: string) => {
  if (status === 'CONFIRMED' || status === 'COMPLETED' || status === 'PAID' || status === 'ORDERED' || status === 'DONE') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'PROCESSING' || status === 'PARTIAL' || status === 'WAIT_CONFIRM') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'FAILED' || status === 'CANCELLED') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
};

const isRotatingExecution = (status: string) => status === 'QUEUED' || status === 'SUBMITTING';

export const Orders: React.FC<OrdersProps> = ({ currentUser }) => {
  const [orders, setOrders] = useState<OrderGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [updatingItemId, setUpdatingItemId] = useState('');
  const [refreshingOrderId, setRefreshingOrderId] = useState('');
  const [submittingOrderId, setSubmittingOrderId] = useState('');
  const [cancellingOrderId, setCancellingOrderId] = useState('');
  const [iframeUrl, setIframeUrl] = useState('');

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

  const loadOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWithAuth('/api/orders');
      setOrders(Array.isArray(data.items) ? data.items : []);
      setExpandedId((prev) => prev && data.items?.some((it: OrderGroup) => it.id === prev) ? prev : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载订单失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== 'ALL' && order.status !== statusFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        order.bizOrderNo.toLowerCase().includes(keyword) ||
        order.hotelName.toLowerCase().includes(keyword) ||
        order.customerName.toLowerCase().includes(keyword) ||
        order.creatorName.toLowerCase().includes(keyword)
      );
    });
  }, [orders, search, statusFilter]);

  const updateSplitItem = async (item: OrderSplitItem, patch: Record<string, unknown>) => {
    setUpdatingItemId(item.id);
    setError('');
    try {
      await fetchWithAuth(`/api/orders/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新拆单失败');
    } finally {
      setUpdatingItemId('');
    }
  };

  const refreshSplit = async (itemId: string) => {
    setUpdatingItemId(itemId);
    setError('');
    try {
      await fetchWithAuth(`/api/orders/items/${itemId}/refresh-status`, { method: 'POST' });
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新拆单状态失败');
    } finally {
      setUpdatingItemId('');
    }
  };

  const refreshOrder = async (orderId: string) => {
    setRefreshingOrderId(orderId);
    setError('');
    try {
      await fetchWithAuth(`/api/orders/${orderId}/refresh-status`, { method: 'POST' });
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新订单状态失败');
    } finally {
      setRefreshingOrderId('');
    }
  };

  const openPaymentLink = async (item: OrderSplitItem) => {
    try {
      const data = await fetchWithAuth(`/api/orders/items/${item.id}/payment-link`);
      const link = data.paymentLink || item.paymentLink;
      if (!link || (item.executionStatus !== 'ORDERED' && item.executionStatus !== 'DONE')) {
        setError('该拆单当前无可用支付链接');
        return;
      }
      window.open(link, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取支付链接失败');
    }
  };

  const openDetailIframe = async (item: OrderSplitItem) => {
    try {
      const data = await fetchWithAuth(`/api/orders/items/${item.id}/detail-link`);
      const url = data.detailUrl || item.detailUrl;
      if (!url || (item.executionStatus !== 'ORDERED' && item.executionStatus !== 'DONE')) {
        setError('该拆单暂无可跳转的官方订单详情链接');
        return;
      }
      setIframeUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取订单详情链接失败');
    }
  };

  const confirmSubmitItem = async (item: OrderSplitItem) => {
    setUpdatingItemId(item.id);
    setError('');
    try {
      await fetchWithAuth(`/api/orders/items/${item.id}/confirm-submit`, { method: 'POST' });
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '确认下单失败');
    } finally {
      setUpdatingItemId('');
    }
  };

  const cancelItem = async (item: OrderSplitItem) => {
    setUpdatingItemId(item.id);
    setError('');
    try {
      await fetchWithAuth(`/api/orders/items/${item.id}/cancel`, { method: 'POST' });
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消拆单失败');
    } finally {
      setUpdatingItemId('');
    }
  };

  const submitOrder = async (orderId: string) => {
    setSubmittingOrderId(orderId);
    setError('');
    try {
      await fetchWithAuth(`/api/orders/${orderId}/submit`, { method: 'POST' });
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '一键下单失败');
    } finally {
      setSubmittingOrderId('');
    }
  };

  const cancelOrder = async (orderId: string) => {
    setCancellingOrderId(orderId);
    setError('');
    try {
      await fetchWithAuth(`/api/orders/${orderId}/cancel`, { method: 'POST' });
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '一键取消失败');
    } finally {
      setCancellingOrderId('');
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">订单中心</h2>
          <p className="text-xs text-gray-500 mt-1">
            主订单聚合 + 拆单时间线，支持一键刷新、拆单刷新、支付链接、官方详情 iframe 查看。
          </p>
        </div>
        <button
          onClick={loadOrders}
          className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
        >
          刷新列表
        </button>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={currentUser?.role === 'ADMIN' ? '搜索：主订单号/酒店/入住人/下单员' : '搜索：主订单号/酒店/入住人'}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            <option value="ALL">全部状态</option>
            <option value="PROCESSING">处理中</option>
            <option value="CONFIRMED">已确认</option>
            <option value="COMPLETED">已完成</option>
            <option value="CANCELLED">已取消</option>
            <option value="FAILED">失败</option>
          </select>
          <div className="text-sm text-gray-500 flex items-center justify-end">
            共 {filtered.length} 个主订单
          </div>
        </div>
      </Card>

      {error && (
        <div className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pb-3">
        {loading ? (
          <Card><div className="py-10 text-center text-gray-500">订单加载中...</div></Card>
        ) : filtered.length === 0 ? (
          <Card><div className="py-10 text-center text-gray-400">暂无订单数据</div></Card>
        ) : (
          filtered.map((order) => {
            const expanded = expandedId === order.id;
            return (
              <Card key={order.id} className="p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId((prev) => prev === order.id ? null : order.id)}
                  className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="space-y-1">
                      <div className="text-xs text-gray-400">主订单号: {order.bizOrderNo}</div>
                      <div className="font-semibold text-gray-900">{order.hotelName}</div>
                      <div className="text-sm text-gray-600">
                        入住人: {order.customerName} | 入离: {order.checkInDate} - {order.checkOutDate} ({order.totalNights}晚)
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-1 rounded border text-xs ${statusClass(order.status)}`}>{statusText(order.status)}</span>
                      <span className={`px-2 py-1 rounded border text-xs ${statusClass(order.paymentStatus)}`}>{statusText(order.paymentStatus)}</span>
                      <span className="px-2 py-1 rounded border text-xs bg-blue-50 text-blue-700 border-blue-200">拆单 {order.splitCount} 条</span>
                      <span className="font-semibold text-gray-900">{order.currency} {order.totalAmount}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          refreshOrder(order.id);
                        }}
                        disabled={refreshingOrderId === order.id}
                        className="px-2 py-1 rounded border border-indigo-200 text-xs bg-indigo-50 text-indigo-700 disabled:opacity-50"
                      >
                        {refreshingOrderId === order.id ? '刷新中...' : '一键刷新状态'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          submitOrder(order.id);
                        }}
                        disabled={submittingOrderId === order.id}
                        className="px-2 py-1 rounded border border-emerald-200 text-xs bg-emerald-50 text-emerald-700 disabled:opacity-50"
                      >
                        {submittingOrderId === order.id ? '下单中...' : '一键下单'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelOrder(order.id);
                        }}
                        disabled={cancellingOrderId === order.id}
                        className="px-2 py-1 rounded border border-red-200 text-xs bg-red-50 text-red-700 disabled:opacity-50"
                      >
                        {cancellingOrderId === order.id ? '取消中...' : '一键取消'}
                      </button>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                    <div className="text-xs text-gray-500">
                      下单员: {order.creatorName} | 创建时间: {new Date(order.createdAt).toLocaleString()} {order.remark ? `| 备注: ${order.remark}` : ''}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm bg-white rounded-lg overflow-hidden border border-gray-100">
                        <thead className="bg-gray-100 text-gray-600">
                          <tr>
                            <th className="px-3 py-2 text-left">拆单</th>
                            <th className="px-3 py-2 text-left">入住离店</th>
                            <th className="px-3 py-2 text-left">亚朵单号</th>
                            <th className="px-3 py-2 text-left">账号</th>
                            <th className="px-3 py-2 text-left">金额</th>
                            <th className="px-3 py-2 text-left">执行状态</th>
                            <th className="px-3 py-2 text-left">支付状态</th>
                            <th className="px-3 py-2 text-right">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.items.map((item) => (
                            <tr key={item.id} className="border-t border-gray-100">
                              <td className="px-3 py-2">#{item.splitIndex}/{item.splitTotal} {item.roomType} x{item.roomCount}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">{item.checkInDate} ~ {item.checkOutDate}</td>
                              <td className="px-3 py-2 font-mono text-xs">{item.atourOrderId || '-'}</td>
                              <td className="px-3 py-2">{item.accountPhone || '-'}</td>
                              <td className="px-3 py-2">{order.currency} {item.amount}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${statusClass(item.executionStatus)}`}>
                                  {isRotatingExecution(item.executionStatus) && <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />}
                                  {executionText(item.executionStatus)}
                                </span>
                              </td>
                              <td className="px-3 py-2"><span className={`px-2 py-1 rounded border text-xs ${statusClass(item.paymentStatus)}`}>{statusText(item.paymentStatus)}</span></td>
                              <td className="px-3 py-2 text-right">
                                <div className="flex gap-2 justify-end flex-wrap">
                                  <button
                                    disabled={updatingItemId === item.id}
                                    onClick={() => refreshSplit(item.id)}
                                    className="px-2 py-1 text-xs rounded border border-indigo-200 text-indigo-700 bg-indigo-50 disabled:opacity-50"
                                  >
                                    刷新状态
                                  </button>
                                  {item.executionStatus === 'PLAN_PENDING' && (
                                    <button
                                      disabled={updatingItemId === item.id}
                                      onClick={() => confirmSubmitItem(item)}
                                      className="px-2 py-1 text-xs rounded border border-emerald-200 text-emerald-700 bg-emerald-50 disabled:opacity-50"
                                    >
                                      确认下单
                                    </button>
                                  )}
                                  <button
                                    disabled={updatingItemId === item.id || (item.executionStatus !== 'ORDERED' && item.executionStatus !== 'DONE')}
                                    onClick={() => openPaymentLink(item)}
                                    className="px-2 py-1 text-xs rounded border border-blue-200 text-blue-700 bg-blue-50 disabled:opacity-50"
                                  >
                                    支付链接
                                  </button>
                                  <button
                                    disabled={item.executionStatus !== 'ORDERED' && item.executionStatus !== 'DONE'}
                                    onClick={() => openDetailIframe(item)}
                                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-700 bg-white disabled:opacity-40"
                                  >
                                    官方详情
                                  </button>
                                  <button
                                    disabled={updatingItemId === item.id}
                                    onClick={() => cancelItem(item)}
                                    className="px-2 py-1 text-xs rounded border border-red-200 text-red-700 bg-red-50 disabled:opacity-50"
                                  >
                                    取消
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {iframeUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 p-4">
          <div className="h-full w-full bg-white rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">官方订单详情</div>
              <button
                onClick={() => setIframeUrl('')}
                className="px-3 py-1 text-xs rounded border border-gray-200"
              >
                关闭
              </button>
            </div>
            <iframe title="官方订单详情" src={iframeUrl} className="w-full flex-1" />
          </div>
        </div>
      )}
    </div>
  );
};
