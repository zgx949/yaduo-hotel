import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';

type OtaTab = 'PRODUCTS' | 'ORDERS' | 'CONFIG';

interface OtaHotelRoom {
  platformRoomTypeId: string;
  roomTypeName: string;
  bedType?: string;
}

interface OtaHotel {
  platform: string;
  platformHotelId: string;
  hotelName: string;
  city?: string;
  status?: string;
  rooms?: OtaHotelRoom[];
}

interface OtaMappingHotel {
  id: string;
  platform: string;
  platformHotelId: string;
  platformHotelName?: string;
  internalChainId: string;
  internalHotelName: string;
  enabled: boolean;
  updatedAt: string;
}

interface OtaMappingRoom {
  id: string;
  platform: string;
  platformHotelId: string;
  platformRoomTypeId: string;
  platformRoomTypeName?: string;
  internalRoomTypeId: string;
  internalRoomTypeName: string;
  rateCode?: string;
  rateCodeId?: string;
  rpActivityId?: string;
  bookingTier?: string;
  platformChannel?: string;
  orderSubmitMode?: string;
  autoOrderEnabled?: boolean;
  autoSyncEnabled?: boolean;
  manualTuningEnabled?: boolean;
  autoSyncFutureDays?: number;
  enabled: boolean;
  updatedAt: string;
}

interface OtaChannelMapping {
  id: string;
  platform: string;
  platformChannel: string;
  internalBookingTier: string;
  internalChannelName: string;
  autoSubmit: boolean;
  enabled: boolean;
  updatedAt: string;
}

interface OtaCalendarItem {
  id: string;
  platform: string;
  platformHotelId: string;
  platformRoomTypeId: string;
  date: string;
  price: number;
  inventory: number;
  currency: string;
  updatedAt: string;
  lastPushedAt?: string | null;
}

interface OtaInboundOrder {
  id: string;
  platform: string;
  externalOrderId: string;
  status: string;
  platformHotelId: string;
  platformRoomTypeId: string;
  platformChannel: string;
  customerName: string;
  checkInDate: string;
  checkOutDate: string;
  amount: number;
  currency: string;
}

interface OtaOrderBinding {
  id: string;
  platform: string;
  externalOrderId: string;
  localOrderId?: string | null;
  autoSubmitState: string;
  manualPaymentState: string;
  bookingConfirmState: string;
  notes?: string;
  updatedAt: string;
}

interface OtaSyncLog {
  id: string;
  type: string;
  platform: string;
  createdAt: string;
}

interface PlaceItem {
  chainId: string | null;
  title: string;
  type: number;
}

interface InternalRoomOption {
  id: string;
  name: string;
}

interface OtaInboundTableRow {
  key: string;
  externalOrderId: string;
  customerName: string;
  platformHotelId: string;
  platformRoomTypeId: string;
  platformChannel: string;
  checkInDate: string;
  checkOutDate: string;
  amount: number;
  currency: string;
  status: string;
  localOrderId: string;
  autoSubmitState: string;
  manualPaymentState: string;
  bookingConfirmState: string;
  orderSubmitMode: string;
  autoOrderEnabled: boolean;
}

interface RoomDraft {
  platformHotelId: string;
  platformRoomTypeId: string;
  platformRoomTypeName: string;
  internalRoomTypeId: string;
  internalRoomTypeName: string;
  bookingTier: string;
  platformChannel: string;
  orderSubmitMode: string;
  autoOrderEnabled: boolean;
  rateCode: string;
  rateCodeId: string;
  rpActivityId: string;
  autoSyncEnabled: boolean;
  manualTuningEnabled: boolean;
  autoSyncFutureDays: number;
  enabled: boolean;
}

const bookingTierModeFromValue = (value: string) => {
  const normalized = String(value || '').toUpperCase();
  if (normalized.startsWith('CORPORATE')) {
    return 'CORPORATE';
  }
  if (normalized === 'PLATINUM') {
    return 'PLATINUM';
  }
  if (normalized === 'NEW_USER') {
    return 'NEW_USER';
  }
  return 'NORMAL';
};

const corporateNameFromBookingTier = (value: string) => {
  const text = String(value || '');
  if (!text.toUpperCase().startsWith('CORPORATE:')) {
    return '';
  }
  return text.slice('CORPORATE:'.length).trim();
};

const mergeBookingTierValue = (mode: string, corporateName: string) => {
  if (mode === 'CORPORATE') {
    const name = String(corporateName || '').trim();
    return name ? `CORPORATE:${name}` : 'CORPORATE';
  }
  if (mode === 'PLATINUM') {
    return 'PLATINUM';
  }
  if (mode === 'NEW_USER') {
    return 'NEW_USER';
  }
  return 'NORMAL';
};

const TOKEN_KEY = 'skyhotel_auth_token';
const ORDERS_LIST_STATE_KEY = 'skyagent_orders_list_state_v1';
const WEEK_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const roomKey = (hotelId: string, roomTypeId: string) => `${hotelId}::${roomTypeId}`;

const toDateText = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const buildMonthMatrix = (monthBase: Date) => {
  const first = startOfMonth(monthBase);
  const weekDay = (first.getDay() + 6) % 7;
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - weekDay);
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

export const OtaPlatform: React.FC = () => {
  const [activeTab, setActiveTab] = useState<OtaTab>('PRODUCTS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  const [platform, setPlatform] = useState('FLIGGY');
  const [expandedHotelId, setExpandedHotelId] = useState('');

  const [hotels, setHotels] = useState<OtaHotel[]>([]);
  const [hotelMappings, setHotelMappings] = useState<OtaMappingHotel[]>([]);
  const [roomMappings, setRoomMappings] = useState<OtaMappingRoom[]>([]);
  const [channelMappings, setChannelMappings] = useState<OtaChannelMapping[]>([]);
  const [calendarItems, setCalendarItems] = useState<OtaCalendarItem[]>([]);
  const [inboundOrders, setInboundOrders] = useState<OtaInboundOrder[]>([]);
  const [orderBindings, setOrderBindings] = useState<OtaOrderBinding[]>([]);
  const [syncLogs, setSyncLogs] = useState<OtaSyncLog[]>([]);
  const [corporateOptions, setCorporateOptions] = useState<string[]>([]);

  const [roomDrafts, setRoomDrafts] = useState<Record<string, RoomDraft>>({});
  const [internalRoomsByHotel, setInternalRoomsByHotel] = useState<Record<string, InternalRoomOption[]>>({});

  const [hotelBindModal, setHotelBindModal] = useState({
    open: false,
    otaHotelId: '',
    otaHotelName: '',
    keyword: '',
    searching: false,
    selectedChainId: '',
    selectedHotelName: ''
  });
  const [hotelBindSearchResults, setHotelBindSearchResults] = useState<PlaceItem[]>([]);

  const [calendarModal, setCalendarModal] = useState({
    open: false,
    platformHotelId: '',
    platformRoomTypeId: '',
    roomTypeName: '',
    monthBase: startOfMonth(new Date()),
    selectedDate: ''
  });
  const [dailyDraft, setDailyDraft] = useState({ price: '', inventory: '' });

  const [orderActionForm, setOrderActionForm] = useState({ externalOrderId: '', localOrderId: '', executeNow: true });
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [orderModeFilter, setOrderModeFilter] = useState('ALL');
  const [orderLinkFilter, setOrderLinkFilter] = useState('ALL');
  const [orderCheckInFrom, setOrderCheckInFrom] = useState('');
  const [orderCheckInTo, setOrderCheckInTo] = useState('');

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

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const keys = ['hotels', 'hotelMappings', 'roomMappings', 'channelMappings', 'calendar', 'inboundOrders', 'orderBindings', 'syncLogs'] as const;
      const results = await Promise.allSettled([
        fetchWithAuth(`/api/ota/hotels?platform=${encodeURIComponent(platform)}`),
        fetchWithAuth(`/api/ota/mappings/hotels?platform=${encodeURIComponent(platform)}`),
        fetchWithAuth(`/api/ota/mappings/rooms?platform=${encodeURIComponent(platform)}`),
        fetchWithAuth(`/api/ota/mappings/channels?platform=${encodeURIComponent(platform)}`),
        fetchWithAuth(`/api/ota/calendar?platform=${encodeURIComponent(platform)}`),
        fetchWithAuth(`/api/ota/orders/inbound?platform=${encodeURIComponent(platform)}`),
        fetchWithAuth(`/api/ota/orders/bindings?platform=${encodeURIComponent(platform)}`),
        fetchWithAuth('/api/ota/sync-logs?limit=30')
      ]);

      const failures: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failures.push(`${keys[index]}加载失败`);
          return;
        }
        const items = Array.isArray(result.value?.items) ? result.value.items : [];
        switch (keys[index]) {
          case 'hotels':
            setHotels(items);
            break;
          case 'hotelMappings':
            setHotelMappings(items);
            break;
          case 'roomMappings':
            setRoomMappings(items);
            break;
          case 'channelMappings':
            setChannelMappings(items);
            break;
          case 'calendar':
            setCalendarItems(items);
            break;
          case 'inboundOrders':
            setInboundOrders(items);
            break;
          case 'orderBindings':
            setOrderBindings(items);
            break;
          case 'syncLogs':
            setSyncLogs(items);
            break;
        }
      });
      if (failures.length > 0) {
        setError(failures.join('，'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载OTA数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadCorporateOptions = async () => {
    try {
      const data = await fetchWithAuth('/api/pool/corporate-agreements');
      const names = Array.isArray(data?.items)
        ? data.items.map((it: any) => String(it?.name || '').trim()).filter(Boolean)
        : [];
      setCorporateOptions(Array.from(new Set(names)) as string[]);
    } catch {
      setCorporateOptions([]);
    }
  };

  useEffect(() => {
    loadAll();
  }, [platform]);

  useEffect(() => {
    loadCorporateOptions();
  }, []);

  useEffect(() => {
    const next: Record<string, RoomDraft> = {};
    hotels.forEach((hotel) => {
      (hotel.rooms || []).forEach((room) => {
        const key = roomKey(hotel.platformHotelId, room.platformRoomTypeId);
        const mapped = roomMappings.find((it) => it.platformHotelId === hotel.platformHotelId && it.platformRoomTypeId === room.platformRoomTypeId);
        next[key] = {
          platformHotelId: hotel.platformHotelId,
          platformRoomTypeId: room.platformRoomTypeId,
          platformRoomTypeName: room.roomTypeName || mapped?.platformRoomTypeName || '',
          internalRoomTypeId: mapped?.internalRoomTypeId || '',
          internalRoomTypeName: mapped?.internalRoomTypeName || '',
          bookingTier: mapped?.bookingTier || 'NORMAL',
          platformChannel: mapped?.platformChannel || 'DEFAULT',
          orderSubmitMode: mapped?.orderSubmitMode || 'MANUAL',
          autoOrderEnabled: mapped?.autoOrderEnabled !== false,
          rateCode: mapped?.rateCode || '',
          rateCodeId: mapped?.rateCodeId || '',
          rpActivityId: mapped?.rpActivityId || '',
          autoSyncEnabled: mapped?.autoSyncEnabled !== false,
          manualTuningEnabled: mapped?.manualTuningEnabled === true,
          autoSyncFutureDays: Math.max(1, Number(mapped?.autoSyncFutureDays) || 30),
          enabled: mapped?.enabled !== false
        };
      });
    });
    setRoomDrafts(next);
  }, [hotels, roomMappings]);

  const summary = useMemo(() => ({
    hotelCount: hotels.length,
    roomCount: hotels.reduce((acc, h) => acc + (h.rooms?.length || 0), 0),
    hotelMapped: hotelMappings.filter((it) => it.enabled).length,
    roomMapped: roomMappings.filter((it) => it.enabled).length
  }), [hotels, hotelMappings, roomMappings]);

  const hotelMappingMap = useMemo(() => {
    const map: Record<string, OtaMappingHotel> = {};
    hotelMappings.forEach((it) => {
      map[it.platformHotelId] = it;
    });
    return map;
  }, [hotelMappings]);

  const channelOptions = useMemo(() => {
    const enabledChannels = channelMappings.filter((it) => it.enabled);
    if (enabledChannels.length === 0) {
      return [{ platformChannel: 'DEFAULT', bookingTier: 'NORMAL', label: 'DEFAULT / NORMAL' }];
    }
    return enabledChannels.map((it) => ({
      platformChannel: it.platformChannel,
      bookingTier: it.internalBookingTier,
      label: `${it.platformChannel} / ${it.internalBookingTier}${it.internalChannelName ? ` (${it.internalChannelName})` : ''}`
    }));
  }, [channelMappings]);

  const roomMappingMap = useMemo(() => {
    const map: Record<string, OtaMappingRoom> = {};
    roomMappings.forEach((it) => {
      map[roomKey(it.platformHotelId, it.platformRoomTypeId)] = it;
    });
    return map;
  }, [roomMappings]);

  const bindingMap = useMemo(() => {
    const map: Record<string, OtaOrderBinding> = {};
    orderBindings.forEach((it) => {
      map[it.externalOrderId] = it;
    });
    return map;
  }, [orderBindings]);

  const inboundOrderRows = useMemo<OtaInboundTableRow[]>(() => {
    return inboundOrders.map((it) => {
      const binding = bindingMap[it.externalOrderId];
      const roomMapped = roomMappingMap[roomKey(it.platformHotelId, it.platformRoomTypeId)];
      return {
        key: it.id,
        externalOrderId: it.externalOrderId,
        customerName: it.customerName,
        platformHotelId: it.platformHotelId,
        platformRoomTypeId: it.platformRoomTypeId,
        platformChannel: it.platformChannel,
        checkInDate: it.checkInDate,
        checkOutDate: it.checkOutDate,
        amount: it.amount,
        currency: it.currency,
        status: it.status,
        localOrderId: String(binding?.localOrderId || ''),
        autoSubmitState: binding?.autoSubmitState || 'PENDING',
        manualPaymentState: binding?.manualPaymentState || 'UNPAID',
        bookingConfirmState: binding?.bookingConfirmState || 'PENDING',
        orderSubmitMode: String(roomMapped?.orderSubmitMode || 'MANUAL').toUpperCase(),
        autoOrderEnabled: roomMapped?.autoOrderEnabled !== false
      };
    });
  }, [inboundOrders, bindingMap, roomMappingMap]);

  const filteredInboundOrderRows = useMemo(() => {
    const keyword = orderSearch.trim().toLowerCase();
    return inboundOrderRows.filter((row) => {
      if (orderStatusFilter !== 'ALL' && row.status !== orderStatusFilter) {
        return false;
      }
      if (orderModeFilter !== 'ALL' && row.orderSubmitMode !== orderModeFilter) {
        return false;
      }
      if (orderLinkFilter === 'BOUND' && !row.localOrderId) {
        return false;
      }
      if (orderLinkFilter === 'UNBOUND' && row.localOrderId) {
        return false;
      }
      if (orderCheckInFrom && row.checkInDate && row.checkInDate < orderCheckInFrom) {
        return false;
      }
      if (orderCheckInTo && row.checkInDate && row.checkInDate > orderCheckInTo) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return [
        row.externalOrderId,
        row.localOrderId,
        row.customerName,
        row.platformHotelId,
        row.platformRoomTypeId,
        row.platformChannel,
        row.status,
        row.orderSubmitMode
      ].some((field) => String(field || '').toLowerCase().includes(keyword));
    });
  }, [inboundOrderRows, orderSearch, orderStatusFilter, orderModeFilter, orderLinkFilter, orderCheckInFrom, orderCheckInTo]);

  const calendarForModalRoom = useMemo(() => {
    if (!calendarModal.platformHotelId || !calendarModal.platformRoomTypeId) {
      return [] as OtaCalendarItem[];
    }
    return calendarItems.filter((it) => it.platformHotelId === calendarModal.platformHotelId && it.platformRoomTypeId === calendarModal.platformRoomTypeId);
  }, [calendarItems, calendarModal.platformHotelId, calendarModal.platformRoomTypeId]);

  const calendarMap = useMemo(() => {
    const map: Record<string, OtaCalendarItem> = {};
    calendarForModalRoom.forEach((it) => {
      map[it.date] = it;
    });
    return map;
  }, [calendarForModalRoom]);

  const activeRoomDraft = useMemo(() => {
    if (!calendarModal.platformHotelId || !calendarModal.platformRoomTypeId) {
      return null;
    }
    return roomDrafts[roomKey(calendarModal.platformHotelId, calendarModal.platformRoomTypeId)] || null;
  }, [calendarModal.platformHotelId, calendarModal.platformRoomTypeId, roomDrafts]);

  const monthGrid = useMemo(() => buildMonthMatrix(calendarModal.monthBase), [calendarModal.monthBase]);

  const syncHotels = async () => {
    setActionLoading('syncHotels');
    setError('');
    setNotice('');
    try {
      const data = await fetchWithAuth('/api/ota/hotels/sync', {
        method: 'POST',
        body: JSON.stringify({ platform })
      });
      setNotice(`飞猪产品库同步完成：${Number(data.count) || 0} 家酒店`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setActionLoading('');
    }
  };

  const searchInternalHotels = async () => {
    const keyword = hotelBindModal.keyword.trim();
    if (!keyword) {
      setError('请输入内部酒店关键词');
      return;
    }
    setActionLoading('searchInternalHotel');
    setError('');
    setHotelBindSearchResults([]);
    try {
      const data = await fetchWithAuth(`/api/hotels/place-search?keyword=${encodeURIComponent(keyword)}`);
      const hotelsOnly = Array.isArray(data.hotels) ? data.hotels : [];
      setHotelBindSearchResults(hotelsOnly);
      if (hotelsOnly.length === 0) {
        setNotice('未搜索到匹配内部酒店');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索内部酒店失败');
    } finally {
      setActionLoading('');
    }
  };

  const saveHotelBinding = async () => {
    if (!hotelBindModal.otaHotelId || !hotelBindModal.selectedChainId || !hotelBindModal.selectedHotelName) {
      setError('请先搜索并选择内部酒店');
      return;
    }
    setActionLoading('saveHotelBinding');
    setError('');
    setNotice('');
    try {
      await fetchWithAuth('/api/ota/mappings/hotels', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          platformHotelId: hotelBindModal.otaHotelId,
          platformHotelName: hotelBindModal.otaHotelName,
          internalChainId: hotelBindModal.selectedChainId,
          internalHotelName: hotelBindModal.selectedHotelName,
          enabled: true
        })
      });
      setNotice('酒店绑定已保存');
      setHotelBindModal({
        open: false,
        otaHotelId: '',
        otaHotelName: '',
        keyword: '',
        searching: false,
        selectedChainId: '',
        selectedHotelName: ''
      });
      setHotelBindSearchResults([]);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存酒店绑定失败');
    } finally {
      setActionLoading('');
    }
  };

  const loadInternalRoomsForHotel = async (otaHotelId: string) => {
    const mapping = hotelMappingMap[otaHotelId];
    if (!mapping?.internalChainId) {
      return;
    }
    if (internalRoomsByHotel[otaHotelId] && internalRoomsByHotel[otaHotelId].length > 0) {
      return;
    }
    setActionLoading(`loadInternalRooms:${otaHotelId}`);
    try {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const nextDay = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const data = await fetchWithAuth('/api/hotels/detail', {
        method: 'POST',
        body: JSON.stringify({
          chainId: mapping.internalChainId,
          beginDate: toDateText(tomorrow),
          endDate: toDateText(nextDay),
          name: mapping.internalHotelName
        })
      });
      const rooms = Array.isArray(data?.hotel?.rooms)
        ? data.hotel.rooms.map((room: any) => ({ id: String(room.id || ''), name: String(room.name || room.id || '') })).filter((it: InternalRoomOption) => it.id)
        : [];
      setInternalRoomsByHotel((prev) => ({ ...prev, [otaHotelId]: rooms }));
    } catch {
      setInternalRoomsByHotel((prev) => ({ ...prev, [otaHotelId]: [] }));
    } finally {
      setActionLoading('');
    }
  };

  const patchRoomDraft = (hotelId: string, roomTypeId: string, patch: Partial<RoomDraft>) => {
    const key = roomKey(hotelId, roomTypeId);
    setRoomDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const saveRoomBinding = async (hotelId: string, roomTypeId: string) => {
    const key = roomKey(hotelId, roomTypeId);
    const draft = roomDrafts[key];
    if (!draft) {
      setError('房型草稿不存在');
      return;
    }
    if (!draft.internalRoomTypeId || !draft.internalRoomTypeName) {
      setError('请先绑定内部房型');
      return;
    }
    if (bookingTierModeFromValue(draft.bookingTier) === 'CORPORATE' && !corporateNameFromBookingTier(draft.bookingTier)) {
      setError('企业协议渠道必须填写具体企业名称');
      return;
    }
    if (draft.orderSubmitMode === 'AUTO' && draft.autoOrderEnabled === false) {
      setError('自动模式下请开启自动开关，或切换为手动模式');
      return;
    }
    setActionLoading(`saveRoom:${key}`);
    setError('');
    setNotice('');
    try {
      await fetchWithAuth('/api/ota/mappings/rooms', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          platformHotelId: draft.platformHotelId,
          platformRoomTypeId: draft.platformRoomTypeId,
          platformRoomTypeName: draft.platformRoomTypeName,
          internalRoomTypeId: draft.internalRoomTypeId,
          internalRoomTypeName: draft.internalRoomTypeName,
          bookingTier: draft.bookingTier,
          platformChannel: draft.platformChannel,
          orderSubmitMode: draft.orderSubmitMode,
          autoOrderEnabled: draft.autoOrderEnabled,
          rateCode: draft.rateCode,
          rateCodeId: draft.rateCodeId,
          rpActivityId: draft.rpActivityId,
          autoSyncEnabled: draft.autoSyncEnabled,
          manualTuningEnabled: draft.manualTuningEnabled,
          autoSyncFutureDays: draft.autoSyncFutureDays,
          enabled: draft.enabled
        })
      });
      setNotice(`房型 ${draft.platformRoomTypeName || draft.platformRoomTypeId} 绑定已保存`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存房型绑定失败');
    } finally {
      setActionLoading('');
    }
  };

  const openCalendarModal = (hotel: OtaHotel, room: OtaHotelRoom) => {
    const key = roomKey(hotel.platformHotelId, room.platformRoomTypeId);
    const draft = roomDrafts[key];
    const today = toDateText(new Date());
    const current = calendarItems.find((it) => (
      it.platformHotelId === hotel.platformHotelId
      && it.platformRoomTypeId === room.platformRoomTypeId
      && it.date === today
    ));
    setDailyDraft({
      price: current ? String(current.price) : '',
      inventory: current ? String(current.inventory) : ''
    });
    setCalendarModal({
      open: true,
      platformHotelId: hotel.platformHotelId,
      platformRoomTypeId: room.platformRoomTypeId,
      roomTypeName: room.roomTypeName,
      monthBase: startOfMonth(new Date()),
      selectedDate: today
    });
    if (draft) {
      patchRoomDraft(hotel.platformHotelId, room.platformRoomTypeId, draft);
    }
  };

  const onSelectCalendarDate = (dateText: string) => {
    const existing = calendarMap[dateText];
    setCalendarModal((prev) => ({ ...prev, selectedDate: dateText }));
    setDailyDraft({
      price: existing ? String(existing.price) : '',
      inventory: existing ? String(existing.inventory) : ''
    });
  };

  const saveCalendarDay = async () => {
    if (!calendarModal.platformHotelId || !calendarModal.platformRoomTypeId || !calendarModal.selectedDate) {
      setError('请先选择日期');
      return;
    }
    const price = Number(dailyDraft.price);
    const inventory = Number(dailyDraft.inventory);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(inventory) || inventory < 0) {
      setError('价格和库存必须是非负数');
      return;
    }
    if (!activeRoomDraft?.internalRoomTypeId || activeRoomDraft.enabled === false) {
      setError('请先完成房型绑定并启用该房型，再进行价格库存保存');
      return;
    }

    setActionLoading('saveCalendarDay');
    setError('');
    setNotice('');
    try {
      await fetchWithAuth('/api/ota/calendar', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          items: [{
            platformHotelId: calendarModal.platformHotelId,
            platformRoomTypeId: calendarModal.platformRoomTypeId,
            date: calendarModal.selectedDate,
            price,
            inventory,
            currency: 'CNY'
          }]
        })
      });
      setNotice(`已保存 ${calendarModal.selectedDate} 的价格库存`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存日历失败');
    } finally {
      setActionLoading('');
    }
  };

  const pushSelectedDay = async () => {
    if (!calendarModal.platformHotelId || !calendarModal.platformRoomTypeId || !calendarModal.selectedDate) {
      setError('请先选择日期');
      return;
    }
    const price = Number(dailyDraft.price);
    const inventory = Number(dailyDraft.inventory);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(inventory) || inventory < 0) {
      setError('价格和库存必须是非负数');
      return;
    }
    if (!activeRoomDraft?.internalRoomTypeId || activeRoomDraft.enabled === false) {
      setError('请先完成房型绑定并启用该房型，否则推送会被系统过滤');
      return;
    }

    setActionLoading('pushSelectedDay');
    setError('');
    setNotice('');
    try {
      const data = await fetchWithAuth('/api/ota/push/rate-inventory', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          items: [{
            platformHotelId: calendarModal.platformHotelId,
            platformRoomTypeId: calendarModal.platformRoomTypeId,
            date: calendarModal.selectedDate,
            price,
            inventory,
            currency: 'CNY'
          }]
        })
      });
      setNotice(`推送完成 accepted=${Number(data.acceptedCount) || 0} requestId=${data.requestId || '-'}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '推送失败');
    } finally {
      setActionLoading('');
    }
  };

  const pushAutoSyncBatch = async () => {
    const ok = window.confirm('将触发自动同步批量推送（仅推送启用且自动同步开启的房型），是否继续？');
    if (!ok) {
      return;
    }
    setActionLoading('pushAutoSyncBatch');
    setError('');
    setNotice('');
    try {
      const data = await fetchWithAuth('/api/ota/push/rate-inventory', {
        method: 'POST',
        body: JSON.stringify({ platform })
      });
      setNotice(`批量推送完成 accepted=${Number(data.acceptedCount) || 0} rejected=${Number(data.rejectedCount) || 0}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量推送失败');
    } finally {
      setActionLoading('');
    }
  };

  const pullInboundOrders = async () => {
    setActionLoading('pullInboundOrders');
    setError('');
    setNotice('');
    try {
      const data = await fetchWithAuth('/api/ota/orders/pull', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          count: 5
        })
      });
      setNotice(`拉取完成：新增/更新 ${Number(data.count) || 0} 单，自动下单入队 ${Number(data.autoSubmitTaskCount) || 0} 单`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '拉取订单失败');
    } finally {
      setActionLoading('');
    }
  };

  const jumpToLocalOrder = (localOrderId: string) => {
    const orderId = String(localOrderId || '').trim();
    if (!orderId) {
      setError('当前入站订单还没有绑定本地订单');
      return;
    }
    localStorage.setItem(ORDERS_LIST_STATE_KEY, JSON.stringify({
      search: orderId,
      statusFilter: 'ALL',
      invoiceFilter: 'ALL',
      checkInFrom: '',
      checkInTo: '',
      creatorScope: 'ALL',
      creatorIdFilter: '',
      page: 1,
      pageSize: 20
    }));
    window.dispatchEvent(new CustomEvent('skyagent:navigate', {
      detail: {
        tabId: 'orders'
      }
    }));
  };

  const generateTemplate = async (externalOrderIdArg?: string) => {
    const externalOrderId = String(externalOrderIdArg || orderActionForm.externalOrderId || '').trim();
    if (!externalOrderId) {
      setError('请输入外部订单号');
      return;
    }
    setActionLoading('generateTemplate');
    setError('');
    setNotice('');
    try {
      await fetchWithAuth(`/api/ota/orders/${encodeURIComponent(externalOrderId)}/template?platform=${encodeURIComponent(platform)}`, {
        method: 'POST',
        body: JSON.stringify({ platform })
      });
      setNotice('下单模板已生成');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '模板生成失败');
    } finally {
      setActionLoading('');
    }
  };

  const autoSubmitOrder = async (externalOrderIdArg?: string) => {
    const externalOrderId = String(externalOrderIdArg || orderActionForm.externalOrderId || '').trim();
    if (!externalOrderId) {
      setError('请输入外部订单号');
      return;
    }
    const ok = window.confirm(`确认对外部订单 ${externalOrderId} 执行自动下单？`);
    if (!ok) {
      return;
    }
    setActionLoading('autoSubmitOrder');
    setError('');
    setNotice('');
    try {
      const data = await fetchWithAuth(`/api/ota/orders/${encodeURIComponent(externalOrderId)}/auto-submit?platform=${encodeURIComponent(platform)}`, {
        method: 'POST',
        body: JSON.stringify({ platform, executeNow: orderActionForm.executeNow })
      });
      setNotice(`自动下单完成，本地订单ID：${data.localOrderId || '-'}${data.reused ? '（复用已有）' : ''}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '自动下单失败');
    } finally {
      setActionLoading('');
    }
  };

  const confirmManualPayment = async (externalOrderIdArg?: string, localOrderIdArg?: string) => {
    const externalOrderId = String(externalOrderIdArg || orderActionForm.externalOrderId || '').trim();
    const localOrderId = String(localOrderIdArg || orderActionForm.localOrderId || '').trim();
    if (!externalOrderId) {
      setError('请输入外部订单号');
      return;
    }
    const ok = window.confirm(`确认人工付款并向OTA回告确认？外部订单号：${externalOrderId}`);
    if (!ok) {
      return;
    }
    setActionLoading('confirmManualPayment');
    setError('');
    setNotice('');
    try {
      const data = await fetchWithAuth(`/api/ota/orders/${encodeURIComponent(externalOrderId)}/manual-payment-confirm?platform=${encodeURIComponent(platform)}`, {
        method: 'POST',
        body: JSON.stringify({
          platform,
          localOrderId: localOrderId || undefined
        })
      });
      setNotice(`人工付款确认成功，本地订单ID：${data?.binding?.localOrderId || '-'}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '人工付款确认失败');
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">OTA 平台</h2>
          <p className="text-sm text-gray-500">酒店商品、房型映射、价格库存同步和订单联动控制台。</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm">
            <option value="FLIGGY">飞猪 (FLIGGY)</option>
          </select>
          <button onClick={loadAll} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm hover:bg-gray-50">刷新</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><div className="text-xs text-gray-500">OTA酒店</div><div className="text-xl font-bold text-gray-900">{summary.hotelCount}</div></Card>
        <Card><div className="text-xs text-gray-500">OTA房型</div><div className="text-xl font-bold text-indigo-700">{summary.roomCount}</div></Card>
        <Card><div className="text-xs text-gray-500">已绑定酒店</div><div className="text-xl font-bold text-blue-700">{summary.hotelMapped}</div></Card>
        <Card><div className="text-xs text-gray-500">已绑定房型</div><div className="text-xl font-bold text-emerald-700">{summary.roomMapped}</div></Card>
      </div>

      {(error || notice) && (
        <div className="space-y-2">
          {error && <div className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>}
          {notice && <div className="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">{notice}</div>}
        </div>
      )}

      <div className="flex gap-6 border-b border-gray-200">
        {[
          { id: 'PRODUCTS', label: 'OTA商品' },
          { id: 'ORDERS', label: 'OTA订单' },
          { id: 'CONFIG', label: 'OTA配置' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as OtaTab)}
            className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-10 space-y-4">
        {activeTab === 'PRODUCTS' && (
          <>
            <Card title="OTA酒店商品" action={<div className="flex gap-2"><button disabled={actionLoading !== ''} onClick={syncHotels} className="px-3 py-1.5 text-xs rounded border border-blue-200 text-blue-700 bg-blue-50 disabled:opacity-50">{actionLoading === 'syncHotels' ? '同步中...' : '同步飞猪产品库'}</button><button disabled={actionLoading !== ''} onClick={pushAutoSyncBatch} className="px-3 py-1.5 text-xs rounded border border-amber-200 text-amber-700 bg-amber-50 disabled:opacity-50">{actionLoading === 'pushAutoSyncBatch' ? '执行中...' : '执行自动同步推送'}</button></div>}>
              <div className="space-y-3">
                {hotels.map((hotel) => {
                  const expanded = expandedHotelId === hotel.platformHotelId;
                  const mapping = hotelMappingMap[hotel.platformHotelId];
                  return (
                    <div key={hotel.platformHotelId} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          const next = expanded ? '' : hotel.platformHotelId;
                          setExpandedHotelId(next);
                          if (!expanded) {
                            loadInternalRoomsForHotel(hotel.platformHotelId).catch(() => undefined);
                          }
                        }}
                        className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between"
                      >
                        <div className="text-left">
                          <div className="font-semibold text-gray-900">{hotel.hotelName || '-'}</div>
                          <div className="text-xs text-gray-500">{hotel.platformHotelId} | {hotel.city || '-'} | 房型 {hotel.rooms?.length || 0}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded border ${mapping?.enabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                            {mapping?.enabled ? `已绑定 ${mapping.internalHotelName}` : '未绑定内部酒店'}
                          </span>
                          <span className="text-gray-500">{expanded ? '▾' : '▸'}</span>
                        </div>
                      </button>

                      {expanded && (
                        <div className="p-4 space-y-3">
                          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <div className="text-sm text-gray-700">
                              内部酒店绑定：{mapping ? `${mapping.internalChainId} / ${mapping.internalHotelName}` : '未绑定'}
                            </div>
                            <button
                              onClick={() => {
                                setHotelBindModal({
                                  open: true,
                                  otaHotelId: hotel.platformHotelId,
                                  otaHotelName: hotel.hotelName || '',
                                  keyword: mapping?.internalHotelName || '',
                                  searching: false,
                                  selectedChainId: mapping?.internalChainId || '',
                                  selectedHotelName: mapping?.internalHotelName || ''
                                });
                                setHotelBindSearchResults([]);
                              }}
                              className="px-3 py-1.5 text-xs rounded border border-blue-200 text-blue-700 bg-blue-50"
                            >
                              绑定内部酒店
                            </button>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="text-gray-500">
                                <tr>
                                  <th className="text-left py-2">OTA房型</th>
                                  <th className="text-left py-2">内部房型</th>
                                  <th className="text-left py-2">下单渠道</th>
                                  <th className="text-left py-2">自动同步</th>
                                  <th className="text-left py-2">状态</th>
                                  <th className="text-right py-2">操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(hotel.rooms || []).map((room) => {
                                  const key = roomKey(hotel.platformHotelId, room.platformRoomTypeId);
                                  const draft = roomDrafts[key];
                                  const roomOptions = internalRoomsByHotel[hotel.platformHotelId] || [];
                                  const selectedChannel = channelOptions.find((it) => it.platformChannel === draft?.platformChannel) || channelOptions[0];
                                  const bookingMode = bookingTierModeFromValue(draft?.bookingTier || 'NORMAL');
                                  const corporateName = corporateNameFromBookingTier(draft?.bookingTier || '');
                                  return (
                                    <tr key={key} className="border-t border-gray-100">
                                      <td className="py-2">
                                        <div className="font-medium text-gray-900">{room.roomTypeName || room.platformRoomTypeId}</div>
                                        <div className="text-xs text-gray-500 font-mono">{room.platformRoomTypeId}</div>
                                      </td>
                                      <td className="py-2">
                                        <div className="flex gap-2">
                                          <select
                                            value={draft?.internalRoomTypeId || ''}
                                            onChange={(e) => {
                                              const nextId = e.target.value;
                                              const opt = roomOptions.find((it) => it.id === nextId);
                                              patchRoomDraft(hotel.platformHotelId, room.platformRoomTypeId, {
                                                internalRoomTypeId: nextId,
                                                internalRoomTypeName: opt?.name || ''
                                              });
                                            }}
                                            className="min-w-[180px] border border-gray-200 rounded px-2 py-1 text-xs"
                                          >
                                            <option value="">选择内部房型</option>
                                            {roomOptions.map((opt) => (
                                              <option key={opt.id} value={opt.id}>{opt.name} ({opt.id})</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">{draft?.internalRoomTypeName || '-'}</div>
                                      </td>
                                      <td className="py-2">
                                        <div className="space-y-1">
                                          <select
                                            value={bookingMode}
                                            onChange={(e) => {
                                              const mode = e.target.value;
                                              patchRoomDraft(hotel.platformHotelId, room.platformRoomTypeId, {
                                                bookingTier: mergeBookingTierValue(mode, corporateName)
                                              });
                                            }}
                                            className="border border-gray-200 rounded px-2 py-1 text-xs"
                                          >
                                            <option value="NEW_USER">新客八折</option>
                                            <option value="PLATINUM">铂金</option>
                                            <option value="CORPORATE">企业协议</option>
                                            <option value="NORMAL">普通</option>
                                          </select>
                                          {bookingMode === 'CORPORATE' && (
                                            <div className="space-y-1">
                                              <input
                                                list="ota-corporate-name-list"
                                                value={corporateName}
                                                onChange={(e) => {
                                                  patchRoomDraft(hotel.platformHotelId, room.platformRoomTypeId, {
                                                    bookingTier: mergeBookingTierValue('CORPORATE', e.target.value)
                                                  });
                                                }}
                                                placeholder="搜索企业协议名称"
                                                className="border border-gray-200 rounded px-2 py-1 text-xs w-full"
                                              />
                                              <div className="text-[11px] text-gray-500">企业协议下拉可搜索，支持手动录入新名称</div>
                                            </div>
                                          )}
                                          <select
                                            value={draft?.platformChannel || selectedChannel?.platformChannel || 'DEFAULT'}
                                            onChange={(e) => patchRoomDraft(hotel.platformHotelId, room.platformRoomTypeId, { platformChannel: e.target.value })}
                                            className="border border-gray-200 rounded px-2 py-1 text-xs"
                                          >
                                            {channelOptions.map((opt) => (
                                              <option key={opt.platformChannel} value={opt.platformChannel}>{opt.platformChannel}</option>
                                            ))}
                                          </select>
                                          <div className="flex items-center gap-2">
                                            <select
                                              value={draft?.orderSubmitMode || 'MANUAL'}
                                              onChange={(e) => patchRoomDraft(hotel.platformHotelId, room.platformRoomTypeId, { orderSubmitMode: e.target.value })}
                                              className="border border-gray-200 rounded px-2 py-1 text-xs"
                                            >
                                              <option value="MANUAL">手动模式</option>
                                              <option value="AUTO">自动模式</option>
                                            </select>
                                            <label className="text-[11px] text-gray-600 inline-flex items-center gap-1">
                                              <input
                                                type="checkbox"
                                                checked={draft?.autoOrderEnabled !== false}
                                                onChange={(e) => patchRoomDraft(hotel.platformHotelId, room.platformRoomTypeId, { autoOrderEnabled: e.target.checked })}
                                                disabled={(draft?.orderSubmitMode || 'MANUAL') !== 'AUTO'}
                                              />
                                              自动开关
                                            </label>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-2 text-xs">
                                        <label className="inline-flex items-center gap-1 mr-3">
                                          <input
                                            type="checkbox"
                                            checked={draft?.autoSyncEnabled !== false}
                                            onChange={(e) => patchRoomDraft(hotel.platformHotelId, room.platformRoomTypeId, { autoSyncEnabled: e.target.checked })}
                                          />
                                          自动
                                        </label>
                                        <label className="inline-flex items-center gap-1">
                                          <input
                                            type="checkbox"
                                            checked={draft?.manualTuningEnabled === true}
                                            onChange={(e) => patchRoomDraft(hotel.platformHotelId, room.platformRoomTypeId, { manualTuningEnabled: e.target.checked })}
                                          />
                                          手动微调
                                        </label>
                                        <div className="mt-1 flex items-center gap-1">
                                          <span className="text-[11px] text-gray-500">未来</span>
                                          <input
                                            type="number"
                                            min={1}
                                            value={draft?.autoSyncFutureDays || 30}
                                            onChange={(e) => patchRoomDraft(hotel.platformHotelId, room.platformRoomTypeId, {
                                              autoSyncFutureDays: Math.max(1, Number(e.target.value) || 1)
                                            })}
                                            className="w-16 border border-gray-200 rounded px-1 py-0.5 text-[11px]"
                                          />
                                          <span className="text-[11px] text-gray-500">天</span>
                                        </div>
                                      </td>
                                      <td className="py-2 text-xs">
                                        <label className="inline-flex items-center gap-1">
                                          <input
                                            type="checkbox"
                                            checked={draft?.enabled !== false}
                                            onChange={(e) => patchRoomDraft(hotel.platformHotelId, room.platformRoomTypeId, { enabled: e.target.checked })}
                                          />
                                          启用
                                        </label>
                                      </td>
                                      <td className="py-2 text-right">
                                        <div className="flex justify-end gap-2">
                                          <button
                                            disabled={actionLoading === `saveRoom:${key}`}
                                            onClick={() => saveRoomBinding(hotel.platformHotelId, room.platformRoomTypeId)}
                                            className="px-2 py-1 text-xs rounded border border-indigo-200 text-indigo-700 bg-indigo-50 disabled:opacity-50"
                                          >
                                            {actionLoading === `saveRoom:${key}` ? '保存中...' : '保存绑定'}
                                          </button>
                                          <button
                                            onClick={() => openCalendarModal(hotel, room)}
                                            className="px-2 py-1 text-xs rounded border border-emerald-200 text-emerald-700 bg-emerald-50"
                                          >
                                            价格库存配置
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                                {(hotel.rooms || []).length === 0 && <tr><td colSpan={6} className="py-3 text-xs text-gray-400">当前酒店暂无上架房型</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!loading && hotels.length === 0 && <div className="text-sm text-gray-500">暂无OTA酒店商品，先点击“同步飞猪产品库”。</div>}
              </div>
            </Card>
          </>
        )}

        {activeTab === 'ORDERS' && (
          <>
            <Card title="入站订单（筛选 / 搜索 / 操作）">
              <div className="grid grid-cols-1 md:grid-cols-8 gap-2 mb-3">
                <input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="搜索：外部单号/本地单号/住客/酒店/房型" className="border border-gray-200 rounded px-2 py-2 text-sm" />
                <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)} className="border border-gray-200 rounded px-2 py-2 text-sm bg-white">
                  <option value="ALL">全部状态</option>
                  <option value="NEW">NEW</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
                <select value={orderModeFilter} onChange={(e) => setOrderModeFilter(e.target.value)} className="border border-gray-200 rounded px-2 py-2 text-sm bg-white">
                  <option value="ALL">全部模式</option>
                  <option value="AUTO">自动模式</option>
                  <option value="MANUAL">手动模式</option>
                </select>
                <select value={orderLinkFilter} onChange={(e) => setOrderLinkFilter(e.target.value)} className="border border-gray-200 rounded px-2 py-2 text-sm bg-white">
                  <option value="ALL">全部关联状态</option>
                  <option value="BOUND">已关联本地订单</option>
                  <option value="UNBOUND">未关联本地订单</option>
                </select>
                <input type="date" value={orderCheckInFrom} onChange={(e) => setOrderCheckInFrom(e.target.value)} className="border border-gray-200 rounded px-2 py-2 text-sm" />
                <input type="date" value={orderCheckInTo} onChange={(e) => setOrderCheckInTo(e.target.value)} className="border border-gray-200 rounded px-2 py-2 text-sm" />
                <button disabled={actionLoading !== ''} onClick={pullInboundOrders} className="px-3 py-2 text-sm rounded border border-indigo-200 text-indigo-700 bg-indigo-50 disabled:opacity-50">{actionLoading === 'pullInboundOrders' ? '拉取中...' : '拉取订单'}</button>
                <button disabled={actionLoading !== ''} onClick={loadAll} className="px-3 py-2 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50">刷新订单</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left py-2">外部订单号</th>
                      <th className="text-left py-2">酒店/房型</th>
                      <th className="text-left py-2">住客/金额</th>
                      <th className="text-left py-2">入住离店</th>
                      <th className="text-left py-2">状态</th>
                      <th className="text-left py-2">下单模式</th>
                      <th className="text-left py-2">本地订单</th>
                      <th className="text-right py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInboundOrderRows.map((it) => (
                      <tr key={it.key} className="border-t border-gray-100">
                        <td className="py-2 font-mono text-xs">{it.externalOrderId}</td>
                        <td className="py-2 text-xs">{it.platformHotelId} / {it.platformRoomTypeId}<div className="text-[11px] text-gray-400">渠道 {it.platformChannel}</div></td>
                        <td className="py-2">{it.customerName || '-'}<div className="text-[11px] text-gray-500">{it.currency} {it.amount}</div></td>
                        <td className="py-2 text-xs">{it.checkInDate} ~ {it.checkOutDate}</td>
                        <td className="py-2"><span className={`text-[11px] px-2 py-1 rounded border ${it.status === 'NEW' ? 'bg-amber-50 border-amber-200 text-amber-700' : it.status === 'CONFIRMED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>{it.status}</span></td>
                        <td className="py-2 text-xs">
                          {it.orderSubmitMode === 'AUTO' ? '自动模式' : '手动模式'}
                          {it.orderSubmitMode === 'AUTO' && <div className="text-[11px] text-gray-500">开关: {it.autoOrderEnabled ? '开' : '关'}</div>}
                        </td>
                        <td className="py-2 font-mono text-xs">{it.localOrderId || '-'}</td>
                        <td className="py-2">
                          <div className="flex justify-end gap-1">
                            {it.localOrderId ? (
                              <>
                                <button onClick={() => jumpToLocalOrder(it.localOrderId)} className="px-2 py-1 text-[11px] rounded border border-blue-200 text-blue-700 bg-blue-50">查看订单</button>
                                <button disabled={actionLoading !== ''} onClick={() => confirmManualPayment(it.externalOrderId, it.localOrderId)} className="px-2 py-1 text-[11px] rounded border border-amber-200 text-amber-700 bg-amber-50 disabled:opacity-50">付款确认</button>
                              </>
                            ) : (
                              <>
                                <button disabled={actionLoading !== ''} onClick={() => generateTemplate(it.externalOrderId)} className="px-2 py-1 text-[11px] rounded border border-indigo-200 text-indigo-700 bg-indigo-50 disabled:opacity-50">模板</button>
                                <button
                                  disabled={actionLoading !== '' || (it.orderSubmitMode !== 'AUTO' || !it.autoOrderEnabled)}
                                  onClick={() => autoSubmitOrder(it.externalOrderId)}
                                  className="px-2 py-1 text-[11px] rounded border border-emerald-200 text-emerald-700 bg-emerald-50 disabled:opacity-50"
                                >自动下单</button>
                                <button
                                  disabled={actionLoading !== '' || it.orderSubmitMode !== 'MANUAL'}
                                  onClick={() => autoSubmitOrder(it.externalOrderId)}
                                  className="px-2 py-1 text-[11px] rounded border border-amber-200 text-amber-700 bg-amber-50 disabled:opacity-50"
                                >手动下单</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loading && filteredInboundOrderRows.length === 0 && <tr><td colSpan={9} className="py-3 text-xs text-gray-400">暂无匹配的入站订单</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {activeTab === 'CONFIG' && (
          <>
            <Card title="下单渠道映射">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left py-2">平台渠道</th>
                      <th className="text-left py-2">内部渠道</th>
                      <th className="text-left py-2">自动下单</th>
                      <th className="text-left py-2">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelMappings.map((it) => (
                      <tr key={it.id} className="border-t border-gray-100">
                        <td className="py-2 font-mono text-xs">{it.platformChannel}</td>
                        <td className="py-2">{it.internalBookingTier} {it.internalChannelName ? `(${it.internalChannelName})` : ''}</td>
                        <td className="py-2">{it.autoSubmit ? '是' : '否'}</td>
                        <td className="py-2">{it.enabled ? '启用' : '停用'}</td>
                      </tr>
                    ))}
                    {!loading && channelMappings.length === 0 && <tr><td colSpan={4} className="py-3 text-xs text-gray-400">暂无渠道映射，请先在上游配置</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="同步日志">
              <div className="text-xs text-gray-600 space-y-1">
                {syncLogs.map((it) => (
                  <div key={it.id}>{new Date(it.createdAt).toLocaleString()} | [{it.platform}] {it.type}</div>
                ))}
                {!loading && syncLogs.length === 0 && <div>暂无同步日志</div>}
              </div>
            </Card>
          </>
        )}
      </div>

      <datalist id="ota-corporate-name-list">
        {corporateOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {hotelBindModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[80vh] rounded-xl bg-white border border-gray-200 shadow-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">绑定内部酒店</h3>
                <div className="text-xs text-gray-500 mt-1">OTA酒店：{hotelBindModal.otaHotelName} ({hotelBindModal.otaHotelId})</div>
              </div>
              <button onClick={() => setHotelBindModal((p) => ({ ...p, open: false }))} className="px-2 py-1 text-xs rounded border border-gray-200">关闭</button>
            </div>
            <div className="flex gap-2">
              <input value={hotelBindModal.keyword} onChange={(e) => setHotelBindModal((p) => ({ ...p, keyword: e.target.value }))} placeholder="输入内部酒店关键词" className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm" />
              <button disabled={actionLoading !== ''} onClick={searchInternalHotels} className="px-3 py-2 text-xs rounded border border-blue-200 text-blue-700 bg-blue-50 disabled:opacity-50">{actionLoading === 'searchInternalHotel' ? '搜索中...' : '搜索'}</button>
            </div>
            <div className="border border-gray-200 rounded overflow-auto max-h-[280px]">
              <table className="w-full text-sm">
                <thead className="text-gray-500 bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-3">选择</th>
                    <th className="text-left py-2 px-3">内部酒店</th>
                    <th className="text-left py-2 px-3">chainId</th>
                  </tr>
                </thead>
                <tbody>
                  {hotelBindSearchResults.map((it, idx) => (
                    <tr key={`${it.chainId || 'none'}-${idx}`} className="border-t border-gray-100">
                      <td className="px-3 py-2">
                        <input
                          type="radio"
                          name="internal-hotel-pick"
                          checked={hotelBindModal.selectedChainId === String(it.chainId || '')}
                          onChange={() => setHotelBindModal((p) => ({ ...p, selectedChainId: String(it.chainId || ''), selectedHotelName: it.title }))}
                        />
                      </td>
                      <td className="px-3 py-2">{it.title}</td>
                      <td className="px-3 py-2 font-mono text-xs">{it.chainId || '-'}</td>
                    </tr>
                  ))}
                  {hotelBindSearchResults.length === 0 && <tr><td colSpan={3} className="px-3 py-3 text-xs text-gray-400">暂无搜索结果</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setHotelBindModal((p) => ({ ...p, open: false }))} className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white">取消</button>
              <button disabled={actionLoading !== ''} onClick={saveHotelBinding} className="px-3 py-1.5 text-sm rounded border border-emerald-200 text-emerald-700 bg-emerald-50 disabled:opacity-50">{actionLoading === 'saveHotelBinding' ? '保存中...' : '保存绑定'}</button>
            </div>
          </div>
        </div>
      )}

      {calendarModal.open && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[86vh] bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900">价格库存日历</div>
                <div className="text-xs text-gray-500 mt-1">酒店: {calendarModal.platformHotelId} | 房型: {calendarModal.roomTypeName} ({calendarModal.platformRoomTypeId})</div>
              </div>
              <button onClick={() => setCalendarModal((p) => ({ ...p, open: false }))} className="px-3 py-1 text-xs rounded border border-gray-200">关闭</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 flex-1 min-h-0">
              <div className="lg:col-span-2 border-r border-gray-200 p-4 overflow-auto">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setCalendarModal((p) => ({ ...p, monthBase: startOfMonth(new Date(p.monthBase.getFullYear(), p.monthBase.getMonth() - 1, 1)) }))}
                    className="px-2 py-1 text-xs rounded border border-gray-200"
                  >上一月</button>
                  <div className="text-sm font-medium text-gray-800">{calendarModal.monthBase.getFullYear()}-{String(calendarModal.monthBase.getMonth() + 1).padStart(2, '0')}</div>
                  <button
                    onClick={() => setCalendarModal((p) => ({ ...p, monthBase: startOfMonth(new Date(p.monthBase.getFullYear(), p.monthBase.getMonth() + 1, 1)) }))}
                    className="px-2 py-1 text-xs rounded border border-gray-200"
                  >下一月</button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-1">
                  {WEEK_HEADERS.map((h) => <div key={h} className="text-[11px] text-gray-500 px-1 py-1">{h}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {monthGrid.map((day) => {
                    const dayText = toDateText(day);
                    const item = calendarMap[dayText];
                    const currentMonth = day.getMonth() === calendarModal.monthBase.getMonth();
                    const selected = dayText === calendarModal.selectedDate;
                    return (
                      <button
                        key={dayText}
                        type="button"
                        onClick={() => onSelectCalendarDate(dayText)}
                        className={`min-h-[72px] rounded border text-left px-1.5 py-1 ${selected ? 'border-blue-500 bg-blue-50' : currentMonth ? 'border-gray-200 bg-white hover:bg-gray-50' : 'border-gray-100 bg-gray-50 text-gray-400'}`}
                      >
                        <div className="text-[11px]">{day.getDate()}</div>
                        <div className="text-[10px] mt-1 text-emerald-700">{item ? `￥${item.price}` : '-'}</div>
                        <div className="text-[10px] text-indigo-700">{item ? `库存${item.inventory}` : ''}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 space-y-3 overflow-auto">
                <div className="text-sm font-semibold text-gray-900">{calendarModal.selectedDate || '选择日期'}</div>

                <div className="space-y-2 text-xs text-gray-700">
                  <label className="flex items-center justify-between">
                    <span>自动同步（批量推送过滤）</span>
                    <input
                      type="checkbox"
                      checked={activeRoomDraft?.autoSyncEnabled !== false}
                      onChange={(e) => {
                        if (!activeRoomDraft) return;
                        patchRoomDraft(activeRoomDraft.platformHotelId, activeRoomDraft.platformRoomTypeId, { autoSyncEnabled: e.target.checked });
                      }}
                    />
                  </label>
                  <label className="flex items-center justify-between">
                    <span>允许手动微调</span>
                    <input
                      type="checkbox"
                      checked={activeRoomDraft?.manualTuningEnabled === true}
                      onChange={(e) => {
                        if (!activeRoomDraft) return;
                        patchRoomDraft(activeRoomDraft.platformHotelId, activeRoomDraft.platformRoomTypeId, { manualTuningEnabled: e.target.checked });
                      }}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span>自动推送未来天数</span>
                    <input
                      type="number"
                      min={1}
                      value={activeRoomDraft?.autoSyncFutureDays || 30}
                      onChange={(e) => {
                        if (!activeRoomDraft) return;
                        patchRoomDraft(activeRoomDraft.platformHotelId, activeRoomDraft.platformRoomTypeId, {
                          autoSyncFutureDays: Math.max(1, Number(e.target.value) || 1)
                        });
                      }}
                      className="w-20 border border-gray-200 rounded px-2 py-1 text-xs"
                    />
                  </label>
                  <button
                    disabled={!activeRoomDraft || actionLoading !== ''}
                    onClick={() => {
                      if (!activeRoomDraft) return;
                      saveRoomBinding(activeRoomDraft.platformHotelId, activeRoomDraft.platformRoomTypeId).catch(() => undefined);
                    }}
                    className="w-full px-2 py-1.5 text-xs rounded border border-indigo-200 text-indigo-700 bg-indigo-50 disabled:opacity-50"
                  >
                    保存同步策略
                  </button>
                </div>

                <div className="pt-2 border-t border-gray-200 space-y-2">
                  {(!activeRoomDraft?.internalRoomTypeId || activeRoomDraft.enabled === false) && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      请先在房型行完成“内部房型绑定 + 启用”后再保存或推送日历。
                    </div>
                  )}
                  <input
                    type="number"
                    min={0}
                    disabled={
                      (activeRoomDraft?.autoSyncEnabled === true && activeRoomDraft?.manualTuningEnabled !== true)
                      || !activeRoomDraft?.internalRoomTypeId
                      || activeRoomDraft?.enabled === false
                    }
                    value={dailyDraft.price}
                    onChange={(e) => setDailyDraft((p) => ({ ...p, price: e.target.value }))}
                    placeholder="价格"
                    className="w-full border border-gray-200 rounded px-3 py-2 text-sm disabled:bg-gray-100"
                  />
                  <input
                    type="number"
                    min={0}
                    disabled={
                      (activeRoomDraft?.autoSyncEnabled === true && activeRoomDraft?.manualTuningEnabled !== true)
                      || !activeRoomDraft?.internalRoomTypeId
                      || activeRoomDraft?.enabled === false
                    }
                    value={dailyDraft.inventory}
                    onChange={(e) => setDailyDraft((p) => ({ ...p, inventory: e.target.value }))}
                    placeholder="库存"
                    className="w-full border border-gray-200 rounded px-3 py-2 text-sm disabled:bg-gray-100"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={
                        actionLoading !== ''
                        || (activeRoomDraft?.autoSyncEnabled === true && activeRoomDraft?.manualTuningEnabled !== true)
                        || !activeRoomDraft?.internalRoomTypeId
                        || activeRoomDraft?.enabled === false
                      }
                      onClick={saveCalendarDay}
                      className="flex-1 px-2 py-2 text-xs rounded border border-blue-200 text-blue-700 bg-blue-50 disabled:opacity-50"
                    >
                      {actionLoading === 'saveCalendarDay' ? '保存中...' : '保存当天'}
                    </button>
                    <button
                      disabled={
                        actionLoading !== ''
                        || (activeRoomDraft?.autoSyncEnabled === true && activeRoomDraft?.manualTuningEnabled !== true)
                        || !activeRoomDraft?.internalRoomTypeId
                        || activeRoomDraft?.enabled === false
                      }
                      onClick={pushSelectedDay}
                      className="flex-1 px-2 py-2 text-xs rounded border border-emerald-200 text-emerald-700 bg-emerald-50 disabled:opacity-50"
                    >
                      {actionLoading === 'pushSelectedDay' ? '推送中...' : '推送当天'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
