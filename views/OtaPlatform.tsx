import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';

type OtaTab = 'PRODUCTS' | 'ORDERS' | 'CONFIG';

interface OtaHotelRoom {
  platformRoomTypeId: string;
  roomTypeName: string;
  bedType?: string;
  area?: string;
  floor?: string;
  maxOccupancy?: number | null;
  windowType?: string;
  status?: string;
  rawPayload?: Record<string, unknown> | null;
  rateplans?: OtaRatePlanItem[];
}

interface OtaRatePlanItem {
  rateplanCode: string;
  rateplanName?: string;
  rpid?: string;
  status?: string;
  breakfastCount?: number;
  paymentType?: string;
  cancelPolicy?: string;
  modifiedTime?: string;
}

interface OtaHotel {
  platform: string;
  platformHotelId: string;
  hotelName: string;
  city?: string;
  status?: string;
  rawPayload?: Record<string, unknown> | null;
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
  platformChannel: string;
  rateplanCode: string;
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

interface StrategyModalState {
  open: boolean;
  mode: 'create' | 'edit';
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

interface NodeActionModalState {
  open: boolean;
  type: 'HOTEL' | 'ROOM';
  platformHotelId: string;
  platformRoomTypeId: string;
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

const toRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const pickText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
};

const getDisplayHotelName = (hotel: OtaHotel) => {
  const raw = toRecord(hotel.rawPayload);
  const rawXhotel = toRecord(raw.xhotel);
  const sourceResponse = toRecord(raw.sourceResponse);
  const xhotelGetResponse = toRecord(sourceResponse.xhotel_get_response);
  const xhotelFromResponse = toRecord(xhotelGetResponse.xhotel);
  const sHotel = toRecord(raw.s_hotel);
  const sHotelFromRawX = toRecord(rawXhotel.s_hotel);
  const sHotelFromResponse = toRecord(xhotelFromResponse.s_hotel);

  const nameFromModel = String(hotel.hotelName || '').trim();
  const modelName = nameFromModel && nameFromModel !== hotel.platformHotelId ? nameFromModel : '';

  return pickText(
    modelName,
    rawXhotel.name,
    xhotelFromResponse.name,
    sHotel.name,
    sHotelFromRawX.name,
    sHotelFromResponse.name,
    hotel.platformHotelId
  );
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
  const [selectedHotelNodeId, setSelectedHotelNodeId] = useState('');
  const [selectedRoomNodeId, setSelectedRoomNodeId] = useState('');

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
    platformChannel: 'DEFAULT',
    rateplanCode: '',
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

  const [hotelAddModal, setHotelAddModal] = useState({
    open: false,
    outerId: ''
  });
  const [roomAddModal, setRoomAddModal] = useState({
    open: false,
    hotelOuterId: '',
    roomOuterId: ''
  });
  const [rateplanAddModal, setRateplanAddModal] = useState({
    open: false,
    hotelOuterId: '',
    roomOuterId: '',
    rateplanCode: ''
  });
  const [hotelDeleteModal, setHotelDeleteModal] = useState({
    open: false,
    platformHotelId: '',
    hotelName: '',
    roomCount: 0,
    hasHotelMapping: false,
    roomMappingCount: 0
  });
  const [channelForm, setChannelForm] = useState({
    platformChannel: 'DEFAULT',
    internalBookingTier: 'NORMAL',
    internalChannelName: '',
    autoSubmit: false,
    enabled: true
  });
  const [strategyModal, setStrategyModal] = useState<StrategyModalState>({
    open: false,
    mode: 'create',
    platformHotelId: '',
    platformRoomTypeId: '',
    platformRoomTypeName: '',
    internalRoomTypeId: '',
    internalRoomTypeName: '',
    bookingTier: 'NORMAL',
    platformChannel: 'DEFAULT',
    orderSubmitMode: 'MANUAL',
    autoOrderEnabled: true,
    rateCode: '',
    rateCodeId: '',
    rpActivityId: '',
    autoSyncEnabled: true,
    manualTuningEnabled: false,
    autoSyncFutureDays: 30,
    enabled: true
  });
  const [nodeActionModal, setNodeActionModal] = useState<NodeActionModalState>({
    open: false,
    type: 'HOTEL',
    platformHotelId: '',
    platformRoomTypeId: ''
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
          rateCode: mapped?.rateCode || room.rateplans?.[0]?.rateplanCode || '',
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

  const selectedHotelNode = useMemo(
    () => hotels.find((it) => it.platformHotelId === selectedHotelNodeId) || null,
    [hotels, selectedHotelNodeId]
  );

  const selectedRoomNode = useMemo(
    () => selectedHotelNode?.rooms?.find((it) => roomKey(selectedHotelNode.platformHotelId, it.platformRoomTypeId) === selectedRoomNodeId) || null,
    [selectedHotelNode, selectedRoomNodeId]
  );

  const selectedRoomStrategies = useMemo(() => {
    if (!selectedHotelNode || !selectedRoomNode) {
      return [] as OtaMappingRoom[];
    }
    return roomMappings.filter((it) => (
      it.platformHotelId === selectedHotelNode.platformHotelId
      && it.platformRoomTypeId === selectedRoomNode.platformRoomTypeId
      && String(it.rateCode || '').trim()
    ));
  }, [selectedHotelNode, selectedRoomNode, roomMappings]);

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
      const roomMapped = roomMappings.find((m) => (
        m.platformHotelId === it.platformHotelId
        && m.platformRoomTypeId === it.platformRoomTypeId
        && String(m.platformChannel || 'DEFAULT').toUpperCase() === String(it.platformChannel || 'DEFAULT').toUpperCase()
        && m.enabled !== false
      )) || roomMappings.find((m) => (
        m.platformHotelId === it.platformHotelId
        && m.platformRoomTypeId === it.platformRoomTypeId
        && m.enabled !== false
      ));
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
  }, [inboundOrders, bindingMap, roomMappings]);

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
    if (!calendarModal.platformHotelId || !calendarModal.platformRoomTypeId || !calendarModal.rateplanCode) {
      return [] as OtaCalendarItem[];
    }
    return calendarItems.filter((it) => (
      it.platformHotelId === calendarModal.platformHotelId
      && it.platformRoomTypeId === calendarModal.platformRoomTypeId
      && String(it.platformChannel || 'DEFAULT').toUpperCase() === String(calendarModal.platformChannel || 'DEFAULT').toUpperCase()
      && String(it.rateplanCode || '') === String(calendarModal.rateplanCode || '')
    ));
  }, [calendarItems, calendarModal.platformHotelId, calendarModal.platformRoomTypeId, calendarModal.platformChannel, calendarModal.rateplanCode]);

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

  const addHotelByOuterId = async () => {
    const outerId = hotelAddModal.outerId.trim();
    if (!outerId) {
      setError('请输入酒店 outer_id');
      return;
    }
    setActionLoading('addHotelByOuterId');
    setError('');
    setNotice('');
    try {
      const result = await fetchWithAuth('/api/ota/products/hotels', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          product: {
            outer_id: outerId
          }
        })
      });
      const statusText = String(result?.status || '').toUpperCase();
      const statusLabel = statusText === 'ONLINE' ? '已上架' : (statusText || '未知状态');
      setNotice(`酒店已导入：${outerId}（${statusLabel}）`);
      setHotelAddModal({ open: false, outerId: '' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入酒店失败');
    } finally {
      setActionLoading('');
    }
  };

  const openDeleteHotelModal = (hotel: OtaHotel) => {
    const roomMappingCount = roomMappings.filter((it) => it.platformHotelId === hotel.platformHotelId).length;
    setHotelDeleteModal({
      open: true,
      platformHotelId: hotel.platformHotelId,
      hotelName: getDisplayHotelName(hotel),
      roomCount: Array.isArray(hotel.rooms) ? hotel.rooms.length : 0,
      hasHotelMapping: Boolean(hotelMappingMap[hotel.platformHotelId]),
      roomMappingCount
    });
  };

  const deleteHotelProduct = async () => {
    const platformHotelId = hotelDeleteModal.platformHotelId.trim();
    if (!platformHotelId) {
      setError('缺少酒店ID');
      return;
    }
    setActionLoading(`deleteHotel:${platformHotelId}`);
    setError('');
    setNotice('');
    try {
      const result = await fetchWithAuth(`/api/ota/products/hotels/${encodeURIComponent(platformHotelId)}?platform=${encodeURIComponent(platform)}`, {
        method: 'DELETE',
        body: JSON.stringify({
          platform,
          product: {
            platformHotelId
          }
        })
      });
      const deleted = result?.deleted || {};
      setNotice(`本地删除完成：酒店${Number(deleted.hotelCount) || 0}、房型${Number(deleted.roomTypeCount) || 0}、酒店绑定${Number(deleted.hotelMappingCount) || 0}、房型绑定${Number(deleted.roomMappingCount) || 0}`);
      setHotelDeleteModal({ open: false, platformHotelId: '', hotelName: '', roomCount: 0, hasHotelMapping: false, roomMappingCount: 0 });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除酒店商品失败');
    } finally {
      setActionLoading('');
    }
  };

  const addRoomTypeByOuterId = async () => {
    const hotelOuterId = roomAddModal.hotelOuterId.trim();
    const roomOuterId = roomAddModal.roomOuterId.trim();
    if (!roomOuterId) {
      setError('请填写房型 outer_id');
      return;
    }
    setActionLoading('addRoomTypeByOuterId');
    setError('');
    setNotice('');
    try {
      const result = await fetchWithAuth('/api/ota/products/room-types', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          product: {
            hotel_outer_id: hotelOuterId || undefined,
            room_outer_id: roomOuterId,
            outer_id: roomOuterId
          }
        })
      });
      setNotice(`房型已导入：${roomOuterId}${result?.room?.roomTypeName ? `（${result.room.roomTypeName}）` : ''}`);
      setRoomAddModal((prev) => ({ ...prev, open: false, roomOuterId: '' }));
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入房型失败');
    } finally {
      setActionLoading('');
    }
  };

  const addRateplanByCode = async () => {
    const platformHotelId = rateplanAddModal.hotelOuterId.trim();
    const platformRoomTypeId = rateplanAddModal.roomOuterId.trim();
    const rateplanCode = rateplanAddModal.rateplanCode.trim();
    if (!platformHotelId || !platformRoomTypeId) {
      setError('请先选择酒店和房型后再新增价格政策');
      return;
    }
    if (!rateplanCode) {
      setError('请填写价格政策 rateplan_code');
      return;
    }
    setActionLoading('addRateplanByCode');
    setError('');
    setNotice('');
    try {
      const result = await fetchWithAuth('/api/ota/products/rateplans', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          product: {
            platformHotelId,
            platformRoomTypeId,
            rateplan_code: rateplanCode
          }
        })
      });
      setNotice(`价格政策已导入：${rateplanCode}${result?.rateplan?.rateplanName ? `（${result.rateplan.rateplanName}）` : ''}`);
      setRateplanAddModal((prev) => ({ ...prev, open: false, rateplanCode: '' }));
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入价格政策失败');
    } finally {
      setActionLoading('');
    }
  };

  const openStrategyModalForPlan = (hotel: OtaHotel, room: OtaHotelRoom, plan: OtaRatePlanItem) => {
    const roomOptions = internalRoomsByHotel[hotel.platformHotelId] || [];
    const defaultRoom = roomOptions[0] || null;
    setStrategyModal({
      open: true,
      mode: 'create',
      platformHotelId: hotel.platformHotelId,
      platformRoomTypeId: room.platformRoomTypeId,
      platformRoomTypeName: room.roomTypeName || room.platformRoomTypeId,
      internalRoomTypeId: defaultRoom?.id || '',
      internalRoomTypeName: defaultRoom?.name || '',
      bookingTier: 'NORMAL',
      platformChannel: 'DEFAULT',
      orderSubmitMode: 'MANUAL',
      autoOrderEnabled: true,
      rateCode: plan.rateplanCode,
      rateCodeId: plan.rpid || '',
      rpActivityId: plan.rpid || '',
      autoSyncEnabled: true,
      manualTuningEnabled: false,
      autoSyncFutureDays: 30,
      enabled: true
    });
  };

  const openStrategyModalForEdit = (mapping: OtaMappingRoom) => {
    setStrategyModal({
      open: true,
      mode: 'edit',
      platformHotelId: mapping.platformHotelId,
      platformRoomTypeId: mapping.platformRoomTypeId,
      platformRoomTypeName: mapping.platformRoomTypeName || mapping.platformRoomTypeId,
      internalRoomTypeId: mapping.internalRoomTypeId,
      internalRoomTypeName: mapping.internalRoomTypeName,
      bookingTier: mapping.bookingTier,
      platformChannel: mapping.platformChannel,
      orderSubmitMode: mapping.orderSubmitMode,
      autoOrderEnabled: mapping.autoOrderEnabled,
      rateCode: mapping.rateCode || '',
      rateCodeId: mapping.rateCodeId || '',
      rpActivityId: mapping.rpActivityId || '',
      autoSyncEnabled: mapping.autoSyncEnabled,
      manualTuningEnabled: mapping.manualTuningEnabled,
      autoSyncFutureDays: mapping.autoSyncFutureDays,
      enabled: mapping.enabled
    });
  };

  const saveStrategyConfig = async () => {
    if (!strategyModal.platformHotelId || !strategyModal.platformRoomTypeId || !strategyModal.rateCode) {
      setError('策略记录缺少酒店/房型/价格策略');
      return;
    }
    if (!strategyModal.internalRoomTypeId || !strategyModal.internalRoomTypeName) {
      setError('请先选择内部房型');
      return;
    }
    if (bookingTierModeFromValue(strategyModal.bookingTier) === 'CORPORATE' && !corporateNameFromBookingTier(strategyModal.bookingTier)) {
      setError('企业协议渠道必须填写具体企业名称');
      return;
    }
    setActionLoading('saveStrategyConfig');
    setError('');
    setNotice('');
    try {
      await fetchWithAuth('/api/ota/mappings/rooms', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          platformHotelId: strategyModal.platformHotelId,
          platformRoomTypeId: strategyModal.platformRoomTypeId,
          platformRoomTypeName: strategyModal.platformRoomTypeName,
          internalRoomTypeId: strategyModal.internalRoomTypeId,
          internalRoomTypeName: strategyModal.internalRoomTypeName,
          bookingTier: strategyModal.bookingTier,
          platformChannel: strategyModal.platformChannel,
          orderSubmitMode: strategyModal.orderSubmitMode,
          autoOrderEnabled: strategyModal.autoOrderEnabled,
          rateCode: strategyModal.rateCode,
          rateCodeId: strategyModal.rateCodeId,
          rpActivityId: strategyModal.rpActivityId,
          autoSyncEnabled: strategyModal.autoSyncEnabled,
          manualTuningEnabled: strategyModal.manualTuningEnabled,
          autoSyncFutureDays: strategyModal.autoSyncFutureDays,
          enabled: strategyModal.enabled
        })
      });
      setNotice(`策略配置已保存：${strategyModal.platformChannel} / ${strategyModal.rateCode}`);
      setStrategyModal((prev) => ({ ...prev, open: false }));
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存策略配置失败');
    } finally {
      setActionLoading('');
    }
  };

  const deleteRateplanByCode = async (platformHotelId: string, platformRoomTypeId: string, rateplanCode: string) => {
    const ok = window.confirm(`确认删除价格政策 ${rateplanCode} 吗？`);
    if (!ok) {
      return;
    }
    setActionLoading(`deleteRateplan:${platformRoomTypeId}:${rateplanCode}`);
    setError('');
    setNotice('');
    try {
      await fetchWithAuth('/api/ota/products/rateplans', {
        method: 'DELETE',
        body: JSON.stringify({
          platform,
          product: {
            platformHotelId,
            platformRoomTypeId,
            rateplan_code: rateplanCode
          }
        })
      });
      setNotice(`价格政策已删除：${rateplanCode}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除价格政策失败');
    } finally {
      setActionLoading('');
    }
  };

  const deleteRoomTypeProduct = async (platformHotelId: string, platformRoomTypeId: string) => {
    const ok = window.confirm(`确认删除房型商品 ${platformRoomTypeId}？`);
    if (!ok) {
      return;
    }
    setActionLoading(`deleteRoomType:${platformRoomTypeId}`);
    setError('');
    setNotice('');
    try {
      await fetchWithAuth(`/api/ota/products/room-types/${encodeURIComponent(platformRoomTypeId)}?platform=${encodeURIComponent(platform)}&platformHotelId=${encodeURIComponent(platformHotelId)}`, {
        method: 'DELETE',
        body: JSON.stringify({
          platform,
          product: {
            platformHotelId,
            platformRoomTypeId
          }
        })
      });
      setNotice(`房型商品已删除：${platformRoomTypeId}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除房型商品失败');
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
    if (!draft.rateCode) {
      setError('请先在该房型下选择价格政策（rateplan）后再保存绑定策略');
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

  const openCalendarModal = (hotel: OtaHotel, room: OtaHotelRoom, draftOverride?: RoomDraft | null) => {
    const key = roomKey(hotel.platformHotelId, room.platformRoomTypeId);
    const draft = draftOverride || roomDrafts[key];
    const platformChannel = String(draft?.platformChannel || 'DEFAULT').toUpperCase();
    const rateplanCode = String(draft?.rateCode || '').trim();
    if (!rateplanCode) {
      setError('请先选择价格政策后再配置库存');
      return;
    }
    const today = toDateText(new Date());
    const current = calendarItems.find((it) => (
      it.platformHotelId === hotel.platformHotelId
      && it.platformRoomTypeId === room.platformRoomTypeId
      && String(it.platformChannel || 'DEFAULT').toUpperCase() === platformChannel
      && String(it.rateplanCode || '') === rateplanCode
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
      platformChannel,
      rateplanCode,
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
    if (!calendarModal.platformHotelId || !calendarModal.platformRoomTypeId || !calendarModal.selectedDate || !calendarModal.rateplanCode) {
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
            platformChannel: calendarModal.platformChannel,
            rateplanCode: calendarModal.rateplanCode,
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
    if (!calendarModal.platformHotelId || !calendarModal.platformRoomTypeId || !calendarModal.selectedDate || !calendarModal.rateplanCode) {
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
            platformChannel: calendarModal.platformChannel,
            rateplanCode: calendarModal.rateplanCode,
            date: calendarModal.selectedDate,
            price,
            inventory,
            currency: 'CNY'
          }]
        })
      });
      const reqRef = data?.requestResults?.[0]?.gidAndRpid || '-';
      setNotice(`推送完成 accepted=${Number(data.acceptedCount) || 0} gid/rpid=${reqRef}`);
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

  const saveChannelMapping = async () => {
    const platformChannel = channelForm.platformChannel.trim().toUpperCase();
    if (!platformChannel) {
      setError('请填写平台渠道标识');
      return;
    }
    setActionLoading('saveChannelMapping');
    setError('');
    setNotice('');
    try {
      await fetchWithAuth('/api/ota/mappings/channels', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          platformChannel,
          internalBookingTier: channelForm.internalBookingTier,
          internalChannelName: channelForm.internalChannelName.trim(),
          autoSubmit: channelForm.autoSubmit,
          enabled: channelForm.enabled
        })
      });
      setNotice(`渠道映射已保存：${platformChannel}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存渠道映射失败');
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
            <Card title="商品维护（增删改查）" action={<div className="flex gap-2"><button disabled={actionLoading !== ''} onClick={() => setHotelAddModal({ open: true, outerId: '' })} className="px-3 py-1.5 text-xs rounded border border-blue-200 text-blue-700 bg-blue-50 disabled:opacity-50">新增酒店（outer_id）</button><button disabled={actionLoading !== ''} onClick={() => setRoomAddModal({ open: true, hotelOuterId: '', roomOuterId: '' })} className="px-3 py-1.5 text-xs rounded border border-indigo-200 text-indigo-700 bg-indigo-50 disabled:opacity-50">新增房型（outer_id）</button></div>}>
              <div className="text-sm text-gray-600">层级：酒店 -&gt; 房型 -&gt; 价格政策 -&gt; 下单渠道/自动同步策略。新增酒店调用 <span className="font-mono">taobao.xhotel.get</span>；新增房型调用 <span className="font-mono">taobao.xhotel.roomtype.get</span>；价格政策在房型行内新增，调用 <span className="font-mono">taobao.xhotel.rateplan.get</span>（入参 <span className="font-mono">rateplan_code</span>）。</div>
            </Card>

            <Card title="OTA商品树" action={<div className="flex gap-2"><button disabled={actionLoading !== ''} onClick={syncHotels} className="px-3 py-1.5 text-xs rounded border border-blue-200 text-blue-700 bg-blue-50 disabled:opacity-50">{actionLoading === 'syncHotels' ? '同步中...' : '同步飞猪产品库'}</button><button disabled={actionLoading !== ''} onClick={pushAutoSyncBatch} className="px-3 py-1.5 text-xs rounded border border-amber-200 text-amber-700 bg-amber-50 disabled:opacity-50">{actionLoading === 'pushAutoSyncBatch' ? '执行中...' : '执行自动同步推送'}</button></div>}>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-2 border border-gray-200 rounded-lg p-3 max-h-[680px] overflow-y-auto">
                  <div className="text-xs text-gray-500 mb-2">树形结构：酒店 / 房型。点击节点会弹出对应操作。</div>
                  <div className="space-y-2">
                    {hotels.map((hotel) => {
                      const isSelectedHotel = selectedHotelNodeId === hotel.platformHotelId;
                      const mapping = hotelMappingMap[hotel.platformHotelId];
                      return (
                        <div key={hotel.platformHotelId} className="border border-gray-200 rounded">
                          <button
                            onClick={() => {
                              setSelectedHotelNodeId(hotel.platformHotelId);
                              setSelectedRoomNodeId('');
                              setNodeActionModal({ open: true, type: 'HOTEL', platformHotelId: hotel.platformHotelId, platformRoomTypeId: '' });
                              loadInternalRoomsForHotel(hotel.platformHotelId).catch(() => undefined);
                            }}
                            className={`w-full text-left px-3 py-2 ${isSelectedHotel ? 'bg-blue-50' : 'bg-gray-50'}`}
                          >
                            <div className="text-sm font-medium text-gray-900">{getDisplayHotelName(hotel)}</div>
                            <div className="text-[11px] text-gray-500 font-mono">{hotel.platformHotelId}</div>
                            <div className="text-[11px] text-gray-500">{mapping?.enabled ? `已绑定 ${mapping.internalHotelName}` : '未绑定内部酒店'} / 房型 {hotel.rooms?.length || 0}</div>
                          </button>
                          {isSelectedHotel && (
                            <div className="border-t border-gray-200 bg-white">
                              {(hotel.rooms || []).map((room) => {
                                const roomNodeKey = roomKey(hotel.platformHotelId, room.platformRoomTypeId);
                                const isSelectedRoom = selectedRoomNodeId === roomNodeKey;
                                return (
                                  <button
                                    key={roomNodeKey}
                                    onClick={() => {
                                      setSelectedHotelNodeId(hotel.platformHotelId);
                                      setSelectedRoomNodeId(roomNodeKey);
                                      setNodeActionModal({ open: true, type: 'ROOM', platformHotelId: hotel.platformHotelId, platformRoomTypeId: room.platformRoomTypeId });
                                      loadInternalRoomsForHotel(hotel.platformHotelId).catch(() => undefined);
                                    }}
                                    className={`w-full text-left px-4 py-2 border-t border-gray-100 ${isSelectedRoom ? 'bg-indigo-50' : 'bg-white hover:bg-gray-50'}`}
                                  >
                                    <div className="text-sm text-gray-900">{room.roomTypeName || room.platformRoomTypeId}</div>
                                    <div className="text-[11px] text-gray-500 font-mono">{room.platformRoomTypeId}</div>
                                  </button>
                                );
                              })}
                              {(hotel.rooms || []).length === 0 && <div className="px-4 py-2 text-[11px] text-gray-400">暂无房型</div>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {!loading && hotels.length === 0 && <div className="text-xs text-gray-400">暂无酒店，先新增酒店或同步产品库。</div>}
                  </div>
                </div>

                <div className="lg:col-span-3 border border-gray-200 rounded-lg p-3">
                  {!selectedHotelNode || !selectedRoomNode ? (
                    <div className="text-sm text-gray-500">请先在左侧树中选择一个房型节点，右侧显示该房型的价格策略表格与策略绑定操作。</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{getDisplayHotelName(selectedHotelNode)} / {selectedRoomNode.roomTypeName || selectedRoomNode.platformRoomTypeId}</div>
                          <div className="text-xs text-gray-500 font-mono">{selectedHotelNode.platformHotelId} / {selectedRoomNode.platformRoomTypeId}</div>
                        </div>
                        <button
                          onClick={() => setRateplanAddModal({ open: true, hotelOuterId: selectedHotelNode.platformHotelId, roomOuterId: selectedRoomNode.platformRoomTypeId, rateplanCode: '' })}
                          className="px-3 py-1.5 text-xs rounded border border-blue-200 text-blue-700 bg-blue-50"
                        >新增价格策略</button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-gray-500">
                            <tr>
                              <th className="text-left py-2">价格策略</th>
                              <th className="text-left py-2">策略记录（独立运行）</th>
                              <th className="text-right py-2">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(selectedRoomNode.rateplans || []).map((plan) => {
                              const strategies = selectedRoomStrategies.filter((it) => String(it.rateCode || '') === plan.rateplanCode);
                              return (
                                <tr key={plan.rateplanCode} className="border-t border-gray-100 align-top">
                                  <td className="py-2">
                                    <div className="font-medium text-gray-900">{plan.rateplanName || plan.rateplanCode}</div>
                                    <div className="text-[11px] text-gray-500 font-mono">{plan.rateplanCode}</div>
                                    <div className="text-[11px] text-gray-500">rpid {plan.rpid || '-'} / 早餐 {Number(plan.breakfastCount) || 0} / 状态 {plan.status || '-'}</div>
                                  </td>
                                  <td className="py-2">
                                    {strategies.length === 0 && <div className="text-[11px] text-gray-400">暂无策略配置，点击右侧“新增策略配置”。</div>}
                                    <div className="space-y-1">
                                      {strategies.map((it) => (
                                        <div key={it.id} className="text-[11px] px-2 py-1 rounded border border-gray-200 bg-gray-50">
                                          <div>渠道 {it.platformChannel} / 模式 {it.orderSubmitMode} / 自动同步 {it.autoSyncEnabled ? '开' : '关'} / 状态 {it.enabled ? '启用' : '停用'}</div>
                                          <div className="mt-1 flex gap-2">
                                            <button onClick={() => openStrategyModalForEdit(it)} className="px-1.5 py-0.5 rounded border border-indigo-200 bg-white text-indigo-700">编辑</button>
                                            <button onClick={() => {
                                              const draft: RoomDraft = {
                                                platformHotelId: it.platformHotelId,
                                                platformRoomTypeId: it.platformRoomTypeId,
                                                platformRoomTypeName: it.platformRoomTypeName,
                                                internalRoomTypeId: it.internalRoomTypeId,
                                                internalRoomTypeName: it.internalRoomTypeName,
                                                bookingTier: it.bookingTier,
                                                platformChannel: it.platformChannel,
                                                orderSubmitMode: it.orderSubmitMode,
                                                autoOrderEnabled: it.autoOrderEnabled,
                                                rateCode: it.rateCode || '',
                                                rateCodeId: it.rateCodeId || '',
                                                rpActivityId: it.rpActivityId || '',
                                                autoSyncEnabled: it.autoSyncEnabled,
                                                manualTuningEnabled: it.manualTuningEnabled,
                                                autoSyncFutureDays: it.autoSyncFutureDays,
                                                enabled: it.enabled
                                              };
                                              openCalendarModal(selectedHotelNode, selectedRoomNode, draft);
                                            }} className="px-1.5 py-0.5 rounded border border-emerald-200 bg-white text-emerald-700">库存配置</button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="py-2 text-right">
                                    <div className="flex justify-end gap-2">
                                      <button onClick={() => openStrategyModalForPlan(selectedHotelNode, selectedRoomNode, plan)} className="px-2 py-1 text-xs rounded border border-indigo-200 text-indigo-700 bg-indigo-50">新增策略配置</button>
                                      <button disabled={actionLoading !== ''} onClick={() => deleteRateplanByCode(selectedHotelNode.platformHotelId, selectedRoomNode.platformRoomTypeId, plan.rateplanCode).catch(() => undefined)} className="px-2 py-1 text-xs rounded border border-red-200 text-red-700 bg-red-50 disabled:opacity-50">删除策略</button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {(selectedRoomNode.rateplans || []).length === 0 && <tr><td colSpan={3} className="py-3 text-xs text-gray-400">该房型暂无价格策略，请先新增价格策略。</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
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
            <Card title="渠道绑定维护（增删改查）">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                <input
                  value={channelForm.platformChannel}
                  onChange={(e) => setChannelForm((p) => ({ ...p, platformChannel: e.target.value.toUpperCase() }))}
                  placeholder="平台渠道（如 DEFAULT）"
                  className="border border-gray-200 rounded px-2 py-2 text-sm"
                />
                <select
                  value={channelForm.internalBookingTier}
                  onChange={(e) => setChannelForm((p) => ({ ...p, internalBookingTier: e.target.value }))}
                  className="border border-gray-200 rounded px-2 py-2 text-sm bg-white"
                >
                  <option value="NORMAL">NORMAL</option>
                  <option value="NEW_USER">NEW_USER</option>
                  <option value="PLATINUM">PLATINUM</option>
                  <option value="CORPORATE">CORPORATE</option>
                </select>
                <input
                  value={channelForm.internalChannelName}
                  onChange={(e) => setChannelForm((p) => ({ ...p, internalChannelName: e.target.value }))}
                  placeholder="内部渠道名（可选）"
                  className="border border-gray-200 rounded px-2 py-2 text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={channelForm.autoSubmit}
                    onChange={(e) => setChannelForm((p) => ({ ...p, autoSubmit: e.target.checked }))}
                  />
                  自动下单
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={channelForm.enabled}
                    onChange={(e) => setChannelForm((p) => ({ ...p, enabled: e.target.checked }))}
                  />
                  启用
                </label>
                <button
                  disabled={actionLoading !== ''}
                  onClick={saveChannelMapping}
                  className="px-3 py-2 text-sm rounded border border-emerald-200 text-emerald-700 bg-emerald-50 disabled:opacity-50"
                >
                  {actionLoading === 'saveChannelMapping' ? '保存中...' : '保存渠道绑定'}
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">点击下方列表中的“编辑”可回填并修改，停用可作为删除替代。</div>
            </Card>

            <Card title="下单渠道映射">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left py-2">平台渠道</th>
                      <th className="text-left py-2">内部渠道</th>
                      <th className="text-left py-2">自动下单</th>
                      <th className="text-left py-2">状态</th>
                      <th className="text-right py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelMappings.map((it) => (
                      <tr key={it.id} className="border-t border-gray-100">
                        <td className="py-2 font-mono text-xs">{it.platformChannel}</td>
                        <td className="py-2">{it.internalBookingTier} {it.internalChannelName ? `(${it.internalChannelName})` : ''}</td>
                        <td className="py-2">{it.autoSubmit ? '是' : '否'}</td>
                        <td className="py-2">{it.enabled ? '启用' : '停用'}</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => {
                              setChannelForm({
                                platformChannel: it.platformChannel,
                                internalBookingTier: it.internalBookingTier,
                                internalChannelName: it.internalChannelName || '',
                                autoSubmit: it.autoSubmit,
                                enabled: it.enabled
                              });
                            }}
                            className="px-2 py-1 text-xs rounded border border-blue-200 text-blue-700 bg-blue-50"
                          >编辑</button>
                        </td>
                      </tr>
                    ))}
                    {!loading && channelMappings.length === 0 && <tr><td colSpan={5} className="py-3 text-xs text-gray-400">暂无渠道映射，请先在上游配置</td></tr>}
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

      {hotelAddModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-gray-200 shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">新增 OTA 酒店</h3>
              <button onClick={() => setHotelAddModal({ open: false, outerId: '' })} className="px-2 py-1 text-xs rounded border border-gray-200">关闭</button>
            </div>
            <div className="text-xs text-gray-500">输入酒店 outer_id，系统会调用 taobao.xhotel.get 拉取酒店信息并保存。status=0 会被识别为已上架。</div>
            <input
              value={hotelAddModal.outerId}
              onChange={(e) => setHotelAddModal((p) => ({ ...p, outerId: e.target.value }))}
              placeholder="酒店 outer_id"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setHotelAddModal({ open: false, outerId: '' })} className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white">取消</button>
              <button disabled={actionLoading !== ''} onClick={addHotelByOuterId} className="px-3 py-1.5 text-sm rounded border border-blue-200 text-blue-700 bg-blue-50 disabled:opacity-50">{actionLoading === 'addHotelByOuterId' ? '导入中...' : '导入酒店'}</button>
            </div>
          </div>
        </div>
      )}

      {roomAddModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-gray-200 shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">新增 OTA 房型</h3>
              <button onClick={() => setRoomAddModal({ open: false, hotelOuterId: '', roomOuterId: '' })} className="px-2 py-1 text-xs rounded border border-gray-200">关闭</button>
            </div>
            <div className="text-xs text-gray-500">输入房型 outer_id 即可调用 taobao.xhotel.roomtype.get 拉取信息；酒店 outer_id 仅作为可选补充字段。</div>
            <input
              value={roomAddModal.hotelOuterId}
              onChange={(e) => setRoomAddModal((p) => ({ ...p, hotelOuterId: e.target.value }))}
              placeholder="酒店 outer_id（可选）"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
            />
            <input
              value={roomAddModal.roomOuterId}
              onChange={(e) => setRoomAddModal((p) => ({ ...p, roomOuterId: e.target.value }))}
              placeholder="房型 outer_id"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRoomAddModal({ open: false, hotelOuterId: '', roomOuterId: '' })} className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white">取消</button>
              <button disabled={actionLoading !== ''} onClick={addRoomTypeByOuterId} className="px-3 py-1.5 text-sm rounded border border-indigo-200 text-indigo-700 bg-indigo-50 disabled:opacity-50">{actionLoading === 'addRoomTypeByOuterId' ? '导入中...' : '导入房型'}</button>
            </div>
          </div>
        </div>
      )}

      {rateplanAddModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-gray-200 shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">新增价格政策</h3>
              <button onClick={() => setRateplanAddModal({ open: false, hotelOuterId: '', roomOuterId: '', rateplanCode: '' })} className="px-2 py-1 text-xs rounded border border-gray-200">关闭</button>
            </div>
            <div className="text-xs text-gray-500">输入 rateplan_code，系统调用 taobao.xhotel.rateplan.get 拉取价格政策信息并绑定到当前房型。</div>
            <input value={rateplanAddModal.hotelOuterId} onChange={(e) => setRateplanAddModal((p) => ({ ...p, hotelOuterId: e.target.value }))} placeholder="酒店 outer_id" className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-gray-50" readOnly />
            <input value={rateplanAddModal.roomOuterId} onChange={(e) => setRateplanAddModal((p) => ({ ...p, roomOuterId: e.target.value }))} placeholder="房型 outer_id" className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-gray-50" readOnly />
            <input value={rateplanAddModal.rateplanCode} onChange={(e) => setRateplanAddModal((p) => ({ ...p, rateplanCode: e.target.value }))} placeholder="rateplan_code" className="w-full border border-gray-200 rounded px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRateplanAddModal({ open: false, hotelOuterId: '', roomOuterId: '', rateplanCode: '' })} className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white">取消</button>
              <button disabled={actionLoading !== ''} onClick={addRateplanByCode} className="px-3 py-1.5 text-sm rounded border border-indigo-200 text-indigo-700 bg-indigo-50 disabled:opacity-50">{actionLoading === 'addRateplanByCode' ? '导入中...' : '导入价格政策'}</button>
            </div>
          </div>
        </div>
      )}

      {strategyModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white border border-gray-200 shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">{strategyModal.mode === 'create' ? '新增策略配置' : '编辑策略配置'}</h3>
              <button onClick={() => setStrategyModal((p) => ({ ...p, open: false }))} className="px-2 py-1 text-xs rounded border border-gray-200">关闭</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div>酒店: <span className="font-mono">{strategyModal.platformHotelId}</span></div>
              <div>房型: <span className="font-mono">{strategyModal.platformRoomTypeId}</span></div>
              <div className="col-span-2">价格政策: <span className="font-mono">{strategyModal.rateCode}</span></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <select
                value={strategyModal.internalRoomTypeId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const options = internalRoomsByHotel[strategyModal.platformHotelId] || [];
                  const opt = options.find((it) => it.id === nextId);
                  setStrategyModal((p) => ({ ...p, internalRoomTypeId: nextId, internalRoomTypeName: opt?.name || '' }));
                }}
                className="border border-gray-200 rounded px-2 py-2 text-sm"
              >
                <option value="">选择内部房型</option>
                {(internalRoomsByHotel[strategyModal.platformHotelId] || []).map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name} ({opt.id})</option>
                ))}
              </select>
              <select value={strategyModal.platformChannel} onChange={(e) => setStrategyModal((p) => ({ ...p, platformChannel: e.target.value }))} className="border border-gray-200 rounded px-2 py-2 text-sm">
                {channelOptions.map((opt) => (
                  <option key={opt.platformChannel} value={opt.platformChannel}>{opt.platformChannel}</option>
                ))}
              </select>
              <select value={strategyModal.bookingTier} onChange={(e) => setStrategyModal((p) => ({ ...p, bookingTier: e.target.value }))} className="border border-gray-200 rounded px-2 py-2 text-sm">
                <option value="NEW_USER">新客八折</option>
                <option value="PLATINUM">铂金</option>
                <option value="CORPORATE">企业协议</option>
                <option value="NORMAL">普通</option>
              </select>
              <select value={strategyModal.orderSubmitMode} onChange={(e) => setStrategyModal((p) => ({ ...p, orderSubmitMode: e.target.value }))} className="border border-gray-200 rounded px-2 py-2 text-sm">
                <option value="MANUAL">手动模式</option>
                <option value="AUTO">自动模式</option>
              </select>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={strategyModal.autoOrderEnabled} onChange={(e) => setStrategyModal((p) => ({ ...p, autoOrderEnabled: e.target.checked }))} />自动下单</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={strategyModal.enabled} onChange={(e) => setStrategyModal((p) => ({ ...p, enabled: e.target.checked }))} />启用</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={strategyModal.autoSyncEnabled} onChange={(e) => setStrategyModal((p) => ({ ...p, autoSyncEnabled: e.target.checked }))} />自动同步</label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={strategyModal.manualTuningEnabled} onChange={(e) => setStrategyModal((p) => ({ ...p, manualTuningEnabled: e.target.checked }))} />手动微调</label>
              <div className="flex items-center gap-1 text-sm">
                <span className="text-gray-500">未来</span>
                <input type="number" min={1} value={strategyModal.autoSyncFutureDays} onChange={(e) => setStrategyModal((p) => ({ ...p, autoSyncFutureDays: Math.max(1, Number(e.target.value) || 1) }))} className="w-16 border border-gray-200 rounded px-1 py-1" />
                <span className="text-gray-500">天</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setStrategyModal((p) => ({ ...p, open: false }))} className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white">取消</button>
              <button disabled={actionLoading !== ''} onClick={saveStrategyConfig} className="px-3 py-1.5 text-sm rounded border border-indigo-200 text-indigo-700 bg-indigo-50 disabled:opacity-50">{actionLoading === 'saveStrategyConfig' ? '保存中...' : '保存策略'}</button>
            </div>
          </div>
        </div>
      )}

      {nodeActionModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-gray-200 shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">{nodeActionModal.type === 'HOTEL' ? '酒店节点操作' : '房型节点操作'}</h3>
              <button onClick={() => setNodeActionModal((p) => ({ ...p, open: false }))} className="px-2 py-1 text-xs rounded border border-gray-200">关闭</button>
            </div>
            {nodeActionModal.type === 'HOTEL' ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-500 font-mono">酒店ID: {nodeActionModal.platformHotelId}</div>
                <button
                  onClick={() => {
                    const hotel = hotels.find((it) => it.platformHotelId === nodeActionModal.platformHotelId);
                    const mapping = hotel ? hotelMappingMap[hotel.platformHotelId] : undefined;
                    setHotelBindModal({
                      open: true,
                      otaHotelId: nodeActionModal.platformHotelId,
                      otaHotelName: hotel ? getDisplayHotelName(hotel) : nodeActionModal.platformHotelId,
                      keyword: mapping?.internalHotelName || '',
                      searching: false,
                      selectedChainId: mapping?.internalChainId || '',
                      selectedHotelName: mapping?.internalHotelName || ''
                    });
                    setHotelBindSearchResults([]);
                    setNodeActionModal((p) => ({ ...p, open: false }));
                  }}
                  className="w-full px-3 py-2 text-sm rounded border border-blue-200 text-blue-700 bg-blue-50"
                >绑定内部酒店</button>
                <button
                  onClick={() => {
                    setRoomAddModal({ open: true, hotelOuterId: nodeActionModal.platformHotelId, roomOuterId: '' });
                    setNodeActionModal((p) => ({ ...p, open: false }));
                  }}
                  className="w-full px-3 py-2 text-sm rounded border border-indigo-200 text-indigo-700 bg-indigo-50"
                >新增房型</button>
                <button
                  onClick={() => {
                    const hotel = hotels.find((it) => it.platformHotelId === nodeActionModal.platformHotelId);
                    if (hotel) {
                      openDeleteHotelModal(hotel);
                    }
                    setNodeActionModal((p) => ({ ...p, open: false }));
                  }}
                  className="w-full px-3 py-2 text-sm rounded border border-red-200 text-red-700 bg-red-50"
                >删除酒店（本地）</button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-gray-500 font-mono">酒店ID: {nodeActionModal.platformHotelId}</div>
                <div className="text-xs text-gray-500 font-mono">房型ID: {nodeActionModal.platformRoomTypeId}</div>
                <button
                  onClick={() => {
                    setRateplanAddModal({ open: true, hotelOuterId: nodeActionModal.platformHotelId, roomOuterId: nodeActionModal.platformRoomTypeId, rateplanCode: '' });
                    setNodeActionModal((p) => ({ ...p, open: false }));
                  }}
                  className="w-full px-3 py-2 text-sm rounded border border-blue-200 text-blue-700 bg-blue-50"
                >新增价格策略</button>
                <button
                  onClick={() => {
                    deleteRoomTypeProduct(nodeActionModal.platformHotelId, nodeActionModal.platformRoomTypeId).catch(() => undefined);
                    setNodeActionModal((p) => ({ ...p, open: false }));
                  }}
                  className="w-full px-3 py-2 text-sm rounded border border-red-200 text-red-700 bg-red-50"
                >删除房型</button>
              </div>
            )}
          </div>
        </div>
      )}

      {hotelDeleteModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-white border border-gray-200 shadow-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">确认删除本地 OTA 酒店数据</h3>
              <button
                onClick={() => setHotelDeleteModal({ open: false, platformHotelId: '', hotelName: '', roomCount: 0, hasHotelMapping: false, roomMappingCount: 0 })}
                className="px-2 py-1 text-xs rounded border border-gray-200"
              >关闭</button>
            </div>
            <div className="text-sm text-gray-700 space-y-1">
              <div>酒店：<span className="font-medium">{hotelDeleteModal.hotelName}</span></div>
              <div>ID：<span className="font-mono text-xs">{hotelDeleteModal.platformHotelId}</span></div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
              <div>该操作只删除本地数据库记录，不会调用飞猪远程删除 API。</div>
              <div>将删除内容：</div>
              <div>- 本地 OTA 酒店记录（1条）</div>
              <div>- 本地 OTA 房型记录（约 {hotelDeleteModal.roomCount} 条）</div>
              <div>- 本地酒店绑定记录（{hotelDeleteModal.hasHotelMapping ? '1 条' : '0 条'}）</div>
              <div>- 本地房型绑定记录（约 {hotelDeleteModal.roomMappingCount} 条）</div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setHotelDeleteModal({ open: false, platformHotelId: '', hotelName: '', roomCount: 0, hasHotelMapping: false, roomMappingCount: 0 })}
                className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white"
              >取消</button>
              <button
                disabled={actionLoading !== ''}
                onClick={deleteHotelProduct}
                className="px-3 py-1.5 text-sm rounded border border-red-200 text-red-700 bg-red-50 disabled:opacity-50"
              >{actionLoading.startsWith('deleteHotel:') ? '删除中...' : '确认删除本地记录'}</button>
            </div>
          </div>
        </div>
      )}

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
              <div className="text-xs text-gray-500 mt-1">策略: 渠道 {calendarModal.platformChannel} / 价格政策 {calendarModal.rateplanCode || '-'}</div>
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
