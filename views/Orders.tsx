import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '../components/ui/Card';
import { InvoiceTemplate, OrderGroup, OrderSplitItem, SystemUser } from '../types';

interface OrdersProps {
  currentUser?: SystemUser | null;
}

interface CancelConfirmState {
  mode: 'order' | 'item';
  orderId: string;
  item?: OrderSplitItem;
}

interface OrderCreatorOption {
  id: string;
  name: string;
  username: string;
}

const TOKEN_KEY = 'skyhotel_auth_token';
const ORDERS_LIST_STATE_KEY = 'skyagent_orders_list_state_v1';

const loadOrdersListState = () => {
  try {
    const raw = localStorage.getItem(ORDERS_LIST_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      search: typeof parsed.search === 'string' ? parsed.search : '',
      statusFilter: typeof parsed.statusFilter === 'string' ? parsed.statusFilter : 'ALL',
      invoiceFilter: typeof parsed.invoiceFilter === 'string' ? parsed.invoiceFilter : 'ALL',
      checkInFrom: typeof parsed.checkInFrom === 'string' ? parsed.checkInFrom : '',
      checkInTo: typeof parsed.checkInTo === 'string' ? parsed.checkInTo : '',
      creatorScope: typeof parsed.creatorScope === 'string' ? parsed.creatorScope : 'ALL',
      creatorIdFilter: typeof parsed.creatorIdFilter === 'string' ? parsed.creatorIdFilter : '',
      page: Math.max(1, Number(parsed.page) || 1),
      pageSize: Math.max(1, Number(parsed.pageSize) || 20)
    };
  } catch {
    return {
      search: '',
      statusFilter: 'ALL',
      invoiceFilter: 'ALL',
      checkInFrom: '',
      checkInTo: '',
      creatorScope: 'ALL',
      creatorIdFilter: '',
      page: 1,
      pageSize: 20
    };
  }
};

const statusText = (status: string) => {
  const dict: Record<string, string> = {
    PROCESSING: '处理中',
    WAIT_CONFIRM: '待确认',
    WAITING_CHECKIN: '待入住',
    CONFIRMED: '已确认',
    CANCELLED: '已取消',
    COMPLETED: '已完成',
    FAILED: '失败',
    UNPAID: '未支付',
    PAID: '已支付',
    PARTIAL: '部分支付',
    REFUNDED: '已退款',
    DELETED: '已隐藏'
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

const bookingTierText = (tier?: string | null) => {
  const normalized = String(tier || '').toUpperCase();
  const dict: Record<string, string> = {
    NEW_USER: '新客',
    PLATINUM: '铂金',
    CO_PLATINUM: '联名铂金',
    CORPORATE: '企业协议',
    DIAMOND: '钻石',
    GOLD: '金卡',
    NORMAL: '普通'
  };
  return dict[normalized] || (tier ? String(tier) : '未记录');
};

const statusClass = (status: string) => {
  if (status === 'CONFIRMED' || status === 'COMPLETED' || status === 'PAID' || status === 'ORDERED' || status === 'DONE') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'PROCESSING' || status === 'PARTIAL' || status === 'WAIT_CONFIRM') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'FAILED' || status === 'CANCELLED') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
};

const isRotatingExecution = (status: string) => status === 'QUEUED' || status === 'SUBMITTING';

const canSubmitOrder = (order: OrderGroup) =>
  (order.items || []).some((it) => it.executionStatus === 'PLAN_PENDING' || it.executionStatus === 'FAILED');

const canSoftDeleteOrder = (order: OrderGroup) => order.status === 'FAILED' || order.status === 'CANCELLED';

export const Orders: React.FC<OrdersProps> = ({ currentUser }) => {
  const savedState = loadOrdersListState();
  const [orders, setOrders] = useState<OrderGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState(savedState.search);
  const [debouncedSearch, setDebouncedSearch] = useState(savedState.search);
  const [statusFilter, setStatusFilter] = useState(savedState.statusFilter);
  const [invoiceFilter, setInvoiceFilter] = useState(savedState.invoiceFilter || 'ALL');
  const [checkInFrom, setCheckInFrom] = useState(savedState.checkInFrom);
  const [checkInTo, setCheckInTo] = useState(savedState.checkInTo);
  const [creatorScope, setCreatorScope] = useState(savedState.creatorScope || 'ALL');
  const [creatorIdFilter, setCreatorIdFilter] = useState(savedState.creatorIdFilter || '');
  const [creatorOptions, setCreatorOptions] = useState<OrderCreatorOption[]>([]);
  const [page, setPage] = useState(savedState.page);
  const [pageSize, setPageSize] = useState(savedState.pageSize);
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 20, totalPages: 1, hasMore: false });
  const [updatingItemId, setUpdatingItemId] = useState('');
  const [refreshingOrderId, setRefreshingOrderId] = useState('');
  const [submittingOrderId, setSubmittingOrderId] = useState('');
  const [cancellingOrderId, setCancellingOrderId] = useState('');
  const [deletingOrderId, setDeletingOrderId] = useState('');
  const [iframeUrl, setIframeUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState<CancelConfirmState | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [openingPaymentItemId, setOpeningPaymentItemId] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceTemplates, setInvoiceTemplates] = useState<InvoiceTemplate[]>([]);
  const [invoiceTemplateSearch, setInvoiceTemplateSearch] = useState('');
  const [loadingInvoiceTemplates, setLoadingInvoiceTemplates] = useState(false);
  const [invoiceTemplateId, setInvoiceTemplateId] = useState('');
  const [invoiceEmail, setInvoiceEmail] = useState('');
  const [issuingInvoices, setIssuingInvoices] = useState(false);
  const invoiceTemplateFetchSeqRef = useRef(0);

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
    setNotice('');
    try {
      if (currentUser?.role === 'ADMIN' && creatorScope === 'USER' && !creatorIdFilter) {
        setOrders([]);
        setMeta({ total: 0, page: 1, pageSize, totalPages: 1, hasMore: false });
        return;
      }
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter);
      }
      if (invoiceFilter !== 'ALL') {
        params.set('invoiceStatus', invoiceFilter);
      }
      if (checkInFrom) {
        params.set('checkInFrom', checkInFrom);
      }
      if (checkInTo) {
        params.set('checkInTo', checkInTo);
      }
      if (currentUser?.role === 'ADMIN') {
        const normalizedScope = creatorScope === 'SELF' || creatorScope === 'USER' ? creatorScope : 'ALL';
        params.set('creatorScope', normalizedScope);
        if (normalizedScope === 'USER' && creatorIdFilter) {
          params.set('creatorId', creatorIdFilter);
        }
      }

      const data = await fetchWithAuth(`/api/orders?${params.toString()}`);
      setOrders(Array.isArray(data.items) ? data.items : []);
      setSelectedItemIds((prev) => {
        const all = new Set((Array.isArray(data.items) ? data.items : []).flatMap((order: OrderGroup) => (order.items || []).map((it) => it.id)));
        return prev.filter((id) => all.has(id));
      });
      const nextMeta = data.meta || {};
      setMeta({
        total: Number(nextMeta.total || 0),
        page: Number(nextMeta.page || page),
        pageSize: Number(nextMeta.pageSize || pageSize),
        totalPages: Number(nextMeta.totalPages || 1),
        hasMore: Boolean(nextMeta.hasMore)
      });
      setExpandedId((prev) => prev && data.items?.some((it: OrderGroup) => it.id === prev) ? prev : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载订单失败');
    } finally {
      setLoading(false);
    }
  };

  const loadInvoiceTemplates = async (searchKeyword = '') => {
    const reqSeq = ++invoiceTemplateFetchSeqRef.current;
    setLoadingInvoiceTemplates(true);
    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('pageSize', '200');
      const keyword = searchKeyword.trim();
      if (keyword) {
        params.set('search', keyword);
      }
      const data = await fetchWithAuth(`/api/invoices/templates?${params.toString()}`);
      if (reqSeq !== invoiceTemplateFetchSeqRef.current) {
        return;
      }
      const items = Array.isArray(data.items) ? data.items : [];
      setInvoiceTemplates(items);
      if (items.length === 0) {
        setInvoiceTemplateId('');
      } else if (!items.some((it) => it.id === invoiceTemplateId)) {
        setInvoiceTemplateId(items[0].id);
      }
    } finally {
      if (reqSeq === invoiceTemplateFetchSeqRef.current) {
        setLoadingInvoiceTemplates(false);
      }
    }
  };

  const loadCreatorOptions = async () => {
    if (currentUser?.role !== 'ADMIN') {
      setCreatorOptions([]);
      return;
    }
    const data = await fetchWithAuth('/api/users');
    const users = Array.isArray(data.items) ? data.items : [];
    setCreatorOptions(users.map((it: any) => ({
      id: String(it.id),
      name: String(it.name || it.username || it.id),
      username: String(it.username || it.id)
    })));
  };

  useEffect(() => {
    loadOrders();
  }, [page, pageSize, debouncedSearch, statusFilter, invoiceFilter, checkInFrom, checkInTo, creatorScope, creatorIdFilter, currentUser?.role]);

  useEffect(() => {
    loadCreatorOptions().catch(() => undefined);
  }, [currentUser?.role]);

  useEffect(() => {
    if (currentUser?.role !== 'ADMIN') {
      return;
    }
    if (creatorScope === 'USER' && creatorIdFilter) {
      return;
    }
    if (creatorScope === 'SELF' || creatorScope === 'ALL') {
      setPage(1);
    }
  }, [creatorScope, creatorIdFilter, currentUser?.role]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    localStorage.setItem(ORDERS_LIST_STATE_KEY, JSON.stringify({
      search,
      statusFilter,
      invoiceFilter,
      checkInFrom,
      checkInTo,
      creatorScope,
      creatorIdFilter,
      page,
      pageSize
    }));
  }, [search, statusFilter, invoiceFilter, checkInFrom, checkInTo, creatorScope, creatorIdFilter, page, pageSize]);

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
    setOpeningPaymentItemId(item.id);
    setError('');
    setNotice('正在生成支付链接，请稍候...');
    try {
      const data = await fetchWithAuth(`/api/orders/items/${item.id}/payment-link`);
      const link = data.paymentLink || item.paymentLink;
      if (!link || (item.executionStatus !== 'ORDERED' && item.executionStatus !== 'DONE')) {
        setError('该拆单当前无可用支付链接');
        setNotice('');
        return;
      }
      const bridgeUrl = `/payment-bridge?payUrl=${encodeURIComponent(link)}`;
      window.open(bridgeUrl, '_blank', 'noopener,noreferrer');
      setNotice('支付链接已生成并打开新窗口');
    } catch (err) {
      setNotice('');
      setError(err instanceof Error ? err.message : '获取支付链接失败');
    } finally {
      setOpeningPaymentItemId('');
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
    setNotice('');
    try {
      const data = await fetchWithAuth(`/api/orders/items/${item.id}/cancel`, { method: 'POST' });
      if (data?.queued) {
        setNotice(`拆单 #${item.splitIndex}/${item.splitTotal} 已进入取消队列`);
      } else {
        setNotice(`拆单 #${item.splitIndex}/${item.splitTotal} 已取消`);
      }
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消拆单失败');
    } finally {
      setUpdatingItemId('');
    }
  };

  const requestCancelItem = (orderId: string, item: OrderSplitItem) => {
    setCancelConfirm({ mode: 'item', orderId, item });
  };

  const cancelOrder = async (orderId: string) => {
    setCancellingOrderId(orderId);
    setError('');
    setNotice('');
    try {
      const data = await fetchWithAuth(`/api/orders/${orderId}/cancel`, { method: 'POST' });
      const summary = data?.summary;
      if (summary) {
        setNotice(
          `一键取消完成：总计 ${summary.total} 条，已取消 ${summary.cancelled} 条，排队 ${summary.queued} 条，失败 ${summary.failed} 条`
        );
      } else {
        setNotice('一键取消完成');
      }
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '一键取消失败');
    } finally {
      setCancellingOrderId('');
    }
  };

  const requestCancelOrder = (orderId: string) => {
    setCancelConfirm({ mode: 'order', orderId });
  };

  const softDeleteOrder = async (orderId: string) => {
    setDeletingOrderId(orderId);
    setError('');
    setNotice('');
    try {
      await fetchWithAuth(`/api/orders/${orderId}`, { method: 'DELETE' });
      setNotice('订单已隐藏（软删除）');
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除订单失败');
    } finally {
      setDeletingOrderId('');
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelConfirm) {
      return;
    }
    setConfirmingCancel(true);
    try {
      if (cancelConfirm.mode === 'order') {
        await cancelOrder(cancelConfirm.orderId);
      } else if (cancelConfirm.item) {
        await cancelItem(cancelConfirm.item);
      }
      setCancelConfirm(null);
    } finally {
      setConfirmingCancel(false);
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

  const canSelectForInvoice = (item: OrderSplitItem) => item.status === 'COMPLETED' && item.invoice?.state !== 'ISSUED';

  const allVisibleSelectableItemIds = orders.flatMap((order) => (order.items || []).filter(canSelectForInvoice).map((it) => it.id));
  const isAllVisibleSelected = allVisibleSelectableItemIds.length > 0 && allVisibleSelectableItemIds.every((id) => selectedItemIds.includes(id));
  const isAnyVisibleSelected = allVisibleSelectableItemIds.some((id) => selectedItemIds.includes(id));

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedItemIds((prev) => prev.filter((id) => !allVisibleSelectableItemIds.includes(id)));
      return;
    }
    setSelectedItemIds((prev) => Array.from(new Set([...prev, ...allVisibleSelectableItemIds])));
  };

  const isOrderAllSelected = (order: OrderGroup) => {
    const ids = (order.items || []).filter(canSelectForInvoice).map((it) => it.id);
    return ids.length > 0 && ids.every((id) => selectedItemIds.includes(id));
  };

  const isOrderPartiallySelected = (order: OrderGroup) => {
    const ids = (order.items || []).filter(canSelectForInvoice).map((it) => it.id);
    if (ids.length === 0) {
      return false;
    }
    const selectedCount = ids.filter((id) => selectedItemIds.includes(id)).length;
    return selectedCount > 0 && selectedCount < ids.length;
  };

  const toggleOrderSelection = (order: OrderGroup) => {
    const ids = (order.items || []).filter(canSelectForInvoice).map((it) => it.id);
    if (ids.length === 0) {
      return;
    }
    const allSelected = ids.every((id) => selectedItemIds.includes(id));
    if (allSelected) {
      setSelectedItemIds((prev) => prev.filter((id) => !ids.includes(id)));
      return;
    }
    setSelectedItemIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const toggleItemSelected = (item: OrderSplitItem) => {
    if (!canSelectForInvoice(item)) {
      return;
    }
    setSelectedItemIds((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]));
  };

  const selectedItems = orders.flatMap((order) => order.items || []).filter((item) => selectedItemIds.includes(item.id) && canSelectForInvoice(item));

  const openBatchInvoiceDialog = async () => {
    setError('');
    try {
      setInvoiceTemplateSearch('');
      await loadInvoiceTemplates();
      setInvoiceDialogOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载发票模板失败');
    }
  };

  const searchInvoiceTemplates = async () => {
    setError('');
    try {
      await loadInvoiceTemplates(invoiceTemplateSearch);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索发票模板失败');
    }
  };

  const batchIssueInvoices = async () => {
    setIssuingInvoices(true);
    setError('');
    setNotice('');
    try {
      const data = await fetchWithAuth('/api/invoices/batch-issue', {
        method: 'POST',
        body: JSON.stringify({
          itemIds: selectedItems.map((it) => it.id),
          templateId: invoiceTemplateId,
          email: invoiceEmail || undefined
        })
      });
      setNotice(`批量开票完成：成功 ${data.success || 0}，失败 ${data.failed || 0}`);
      setInvoiceDialogOpen(false);
      setSelectedItemIds([]);
      setInvoiceEmail('');
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量开票失败');
    } finally {
      setIssuingInvoices(false);
    }
  };

  const jumpToBlacklistAdd = (chainId: string, hotelName: string) => {
    window.dispatchEvent(new CustomEvent('skyagent:navigate', {
      detail: {
        tabId: 'blacklist',
        payload: {
          chainId: String(chainId || '').trim(),
          hotelName: String(hotelName || '').trim()
        }
      }
    }));
  };

  return (
    <div className="h-full flex flex-col gap-4 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">订单中心</h2>
          <p className="text-xs text-gray-500 mt-1">
            主订单聚合 + 拆单时间线，支持一键刷新、拆单刷新、支付链接、官方详情 iframe 查看。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openBatchInvoiceDialog}
            disabled={selectedItems.length === 0}
            className="px-3 py-2 text-sm rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50"
          >
            批量开票 ({selectedItems.length})
          </button>
          <button
            onClick={toggleSelectAllVisible}
            disabled={allVisibleSelectableItemIds.length === 0}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {isAllVisibleSelected ? '取消全选' : '全选可开票拆单'}
          </button>
          <button
            onClick={loadOrders}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
          >
            刷新列表
          </button>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={currentUser?.role === 'ADMIN' ? '搜索：主订单号/酒店/入住人/下单员' : '搜索：主订单号/酒店/入住人'}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            <option value="ALL">全部状态</option>
            <option value="PROCESSING">处理中</option>
            <option value="CONFIRMED">已确认</option>
            <option value="COMPLETED">已完成</option>
            <option value="CANCELLED">已取消</option>
            <option value="FAILED">失败</option>
          </select>
          <select
            value={invoiceFilter}
            onChange={(e) => {
              setInvoiceFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            <option value="ALL">全部开票</option>
            <option value="PENDING">待开票</option>
            <option value="ISSUED">已开票</option>
          </select>
          <input
            type="date"
            value={checkInFrom}
            onChange={(e) => {
              setCheckInFrom(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
          <input
            type="date"
            value={checkInTo}
            onChange={(e) => {
              setCheckInTo(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
          {currentUser?.role === 'ADMIN' && (
            <select
              value={creatorScope}
              onChange={(e) => {
                const next = e.target.value;
                setCreatorScope(next);
                if (next !== 'USER') {
                  setCreatorIdFilter('');
                }
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            >
              <option value="ALL">下单人：全部</option>
              <option value="SELF">下单人：我自己</option>
              <option value="USER">下单人：指定用户</option>
            </select>
          )}
          {currentUser?.role === 'ADMIN' && creatorScope === 'USER' && (
            <select
              value={creatorIdFilter}
              onChange={(e) => {
                setCreatorIdFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            >
              <option value="">请选择下单用户</option>
              {creatorOptions.map((user) => (
                <option key={user.id} value={user.id}>{user.name} ({user.username})</option>
              ))}
            </select>
          )}
          <div className="text-sm text-gray-500 flex items-center justify-end md:col-span-6">
            共 {meta.total} 个主订单
            <span className="ml-2">| 已选 {selectedItems.length}/{allVisibleSelectableItemIds.length}</span>
          </div>
        </div>
      </Card>

      {error && (
        <div className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">{notice}</div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pb-3">
        {loading ? (
          <Card><div className="py-10 text-center text-gray-500">订单加载中...</div></Card>
        ) : orders.length === 0 ? (
          <Card><div className="py-10 text-center text-gray-400">暂无订单数据</div></Card>
        ) : (
          orders.map((order) => {
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
                        <div>入住人: {order.customerName} </div>
                        <div>入: {order.checkInDate}</div>
                        <div>离:{order.checkOutDate}(<span className="text-red-700">{order.totalNights}晚</span>)</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 bg-white text-xs text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={isOrderAllSelected(order)}
                          ref={(node) => {
                            if (node) {
                              node.indeterminate = isOrderPartiallySelected(order);
                            }
                          }}
                          onChange={() => toggleOrderSelection(order)}
                        />
                        本组全选
                      </label>
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
                      {canSubmitOrder(order) && (
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
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestCancelOrder(order.id);
                        }}
                        disabled={cancellingOrderId === order.id}
                        className="px-2 py-1 rounded border border-red-200 text-xs bg-red-50 text-red-700 disabled:opacity-50"
                      >
                        {cancellingOrderId === order.id ? '取消中...' : '一键取消'}
                      </button>
                      {canSoftDeleteOrder(order) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            softDeleteOrder(order.id);
                          }}
                          disabled={deletingOrderId === order.id}
                          className="px-2 py-1 rounded border border-slate-200 text-xs bg-slate-50 text-slate-700 disabled:opacity-50"
                        >
                          {deletingOrderId === order.id ? '隐藏中...' : '删除(隐藏)'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          jumpToBlacklistAdd(order.chainId, order.hotelName);
                        }}
                        className="px-2 py-1 rounded border border-red-200 text-xs bg-red-50 text-red-700"
                      >
                        拉黑酒店
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
                            <th className="px-3 py-2 text-left">勾选</th>
                            <th className="px-3 py-2 text-left">拆单</th>
                            <th className="px-3 py-2 text-left">渠道</th>
                            <th className="px-3 py-2 text-left">入住离店</th>
                            <th className="px-3 py-2 text-left">亚朵单号</th>
                            <th className="px-3 py-2 text-left">账号</th>
                            <th className="px-3 py-2 text-left">金额</th>
                            <th className="px-3 py-2 text-left">礼遇券</th>
                            <th className="px-3 py-2 text-left">备注</th>
                            <th className="px-3 py-2 text-left">执行状态</th>
                            <th className="px-3 py-2 text-left">支付状态</th>
                            <th className="px-3 py-2 text-left">开票状态</th>
                            <th className="px-3 py-2 text-right">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.items.map((item) => (
                            <tr key={item.id} className="border-t border-gray-100">
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={selectedItemIds.includes(item.id)}
                                  onChange={() => toggleItemSelected(item)}
                                  disabled={!canSelectForInvoice(item)}
                                  className="w-4 h-4"
                                />
                              </td>
                              <td className="px-3 py-2">#{item.splitIndex}/{item.splitTotal} {item.roomType} x{item.roomCount}</td>
                              <td className="px-3 py-2 text-xs">
                                <span className="px-2 py-1 rounded border border-sky-200 bg-sky-50 text-sky-700">
                                  {bookingTierText(item.bookingTier)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">{item.checkInDate} ~ {item.checkOutDate}</td>
                              <td className="px-3 py-2 font-mono text-xs">{item.atourOrderId || '-'}</td>
                              <td className="px-3 py-2">{item.accountPhone || '-'}</td>
                              <td className="px-3 py-2">{order.currency} {item.amount}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">
                                {[
                                  item.breakfastCount > 0 ? `早${item.breakfastCount}` : '',
                                  item.roomLevelUpCount > 0 ? `升${item.roomLevelUpCount}` : '',
                                  item.delayedCheckOutCount > 0 ? `延${item.delayedCheckOutCount}` : '',
                                  item.shooseCount > 0 ? `鞋${item.shooseCount}` : ''
                                ].filter(Boolean).join(' / ') || '-'}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600 max-w-[180px] truncate">{item.remark || order.remark || '-'}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${statusClass(item.executionStatus)}`}>
                                  {isRotatingExecution(item.executionStatus) && <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />}
                                  {executionText(item.executionStatus)}
                                </span>
                              </td>
                              <td className="px-3 py-2"><span className={`px-2 py-1 rounded border text-xs ${statusClass(item.paymentStatus)}`}>{statusText(item.paymentStatus)}</span></td>
                              <td className="px-3 py-2">
                                {item.invoice ? (
                                  <span className={`px-2 py-1 rounded border text-xs ${item.invoice.state === 'ISSUED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : item.invoice.state === 'FAILED' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                    {item.invoice.state === 'ISSUED' ? '已开票' : item.invoice.state === 'FAILED' ? '开票失败' : '开票中'}
                                  </span>
                                ) : (
                                  <span className={`px-2 py-1 rounded border text-xs ${item.status === 'COMPLETED' ? 'bg-gray-50 text-gray-700 border-gray-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                                    {item.status === 'COMPLETED' ? '可开票' : '未离店'}
                                  </span>
                                )}
                              </td>
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
                                    disabled={updatingItemId === item.id || openingPaymentItemId === item.id || (item.executionStatus !== 'ORDERED' && item.executionStatus !== 'DONE')}
                                    onClick={() => openPaymentLink(item)}
                                    className="px-2 py-1 text-xs rounded border border-blue-200 text-blue-700 bg-blue-50 disabled:opacity-50"
                                  >
                                    {openingPaymentItemId === item.id ? '生成中...' : '支付链接'}
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
                                    onClick={() => requestCancelItem(order.id, item)}
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

      {iframeUrl && createPortal(
        <div className="fixed inset-0 z-[120] bg-black/60 p-3 sm:p-4 md:p-6 flex items-center justify-center">
          <div className="w-full max-w-[460px] h-[min(92vh,980px)] bg-white rounded-xl overflow-hidden flex flex-col shadow-2xl">
            <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">官方订单详情</div>
              <button
                onClick={() => setIframeUrl('')}
                className="px-3 py-1 text-xs rounded border border-gray-200"
              >
                关闭
              </button>
            </div>
            <iframe title="官方订单详情" src={iframeUrl} className="w-full flex-1 min-h-0" />
          </div>
        </div>,
        document.body
      )}

      {invoiceDialogOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-xl p-4 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-gray-900">批量开票</h3>
              <p className="text-sm text-gray-600">已选拆单 {selectedItems.length} 条（仅已离店且未开票的拆单会成功）。</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-gray-500">发票模板</label>
              <div className="flex items-center gap-2">
                <input
                  value={invoiceTemplateSearch}
                  onChange={(e) => setInvoiceTemplateSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      searchInvoiceTemplates();
                    }
                  }}
                  placeholder="搜索模板：抬头/税号/invoiceId"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
                />
                <button
                  type="button"
                  onClick={searchInvoiceTemplates}
                  disabled={loadingInvoiceTemplates}
                  className="px-3 py-2 text-xs rounded border border-gray-200 bg-white disabled:opacity-50"
                >
                  {loadingInvoiceTemplates ? '搜索中...' : '搜索'}
                </button>
              </div>
              <select
                value={invoiceTemplateId}
                onChange={(e) => setInvoiceTemplateId(e.target.value)}
                disabled={loadingInvoiceTemplates || invoiceTemplates.length === 0}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                {invoiceTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{tpl.invoiceName} (invoiceId: {tpl.invoiceId})</option>
                ))}
              </select>
              {!loadingInvoiceTemplates && invoiceTemplates.length === 0 && (
                <div className="text-xs text-gray-500">没有搜索到匹配模板，请换关键词或先到发票管理新增模板。</div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs text-gray-500">接收邮箱（可覆盖模板邮箱）</label>
              <input
                value={invoiceEmail}
                onChange={(e) => setInvoiceEmail(e.target.value)}
                placeholder="不填则使用模板邮箱"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setInvoiceDialogOpen(false)}
                disabled={issuingInvoices}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={batchIssueInvoices}
                disabled={issuingInvoices || loadingInvoiceTemplates || !invoiceTemplateId || selectedItems.length === 0}
                className="px-3 py-1.5 text-sm rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50"
              >
                {issuingInvoices ? '开票中...' : '确认开票'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-xl p-4 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-gray-900">确认取消</h3>
              <p className="text-sm text-gray-600">
                {cancelConfirm.mode === 'order'
                  ? '确定要执行一键取消吗？系统会并发取消该主订单下的所有未取消拆单，并汇总返回结果。'
                  : `确定要取消拆单 #${cancelConfirm.item?.splitIndex}/${cancelConfirm.item?.splitTotal} 吗？`}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelConfirm(null)}
                disabled={confirmingCancel}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={confirmingCancel}
                className="px-3 py-1.5 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 disabled:opacity-50"
              >
                {confirmingCancel ? '处理中...' : '确认取消'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
