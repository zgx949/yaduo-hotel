import React, { useEffect, useMemo, useState } from 'react';

interface StrategyNode {
  platformHotelId: string;
  platformRoomTypeId: string;
  platformChannel: string;
  rateCode: string;
  srid?: string | null;
  breakfastCount?: number;
  guaranteeType?: number;
  cancelPolicyCal?: unknown;
  publishStatus?: string;
  lastPublishedAt?: string | null;
  updatedAt?: string;
  platformRoomTypeName?: string;
  internalRoomTypeName?: string;
}

interface RoomNode {
  platformRoomTypeId: string;
  roomTypeName: string;
  strategies: StrategyNode[];
}

interface HotelNode {
  platformHotelId: string;
  hotelName: string;
  rooms: RoomNode[];
  mapping?: {
    platformHotelName?: string;
    internalHotelName?: string;
    shid?: string | null;
  } | null;
}

interface StrategyDraft {
  platformHotelId: string;
  platformRoomTypeId: string;
  platformChannel: string;
  rateCode: string;
  srid: string;
  breakfastCount: number;
  guaranteeType: number;
  cancelPolicyCal: string;
}

interface AtourPlaceItem {
  id?: string;
  chainId?: string;
  chainName?: string;
  title?: string;
  subTitle?: string;
  cityName?: string;
  type?: number;
  address?: string;
}

const TOKEN_KEY = 'skyhotel_auth_token';

const defaultDraft = (): StrategyDraft => ({
  platformHotelId: '',
  platformRoomTypeId: '',
  platformChannel: 'DEFAULT',
  rateCode: '',
  srid: '',
  breakfastCount: 0,
  guaranteeType: 0,
  cancelPolicyCal: ''
});

const safeJsonStringify = (value: unknown) => {
  if (!value || (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0)) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
};

const parseJsonText = (value: string) => {
  const text = value.trim();
  if (!text) {
    return null;
  }
  return JSON.parse(text);
};

const publishBadge = (status?: string) => {
  const normalized = String(status || 'DRAFT').toUpperCase();
  if (normalized === 'PUBLISHED') {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (normalized === 'FAILED') {
    return 'bg-red-100 text-red-700';
  }
  if (normalized === 'PUBLISHING') {
    return 'bg-amber-100 text-amber-700';
  }
  return 'bg-gray-100 text-gray-700';
};

const getHotelDisplayName = (hotel: HotelNode) => {
  return (
    String(hotel.hotelName || '').trim()
    || String(hotel.mapping?.platformHotelName || '').trim()
    || String(hotel.mapping?.internalHotelName || '').trim()
    || hotel.platformHotelId
  );
};

const getRoomDisplayName = (room: RoomNode) => {
  const strategyBasedName = (room.strategies || []).find((it) => String(it.platformRoomTypeName || '').trim())?.platformRoomTypeName;
  const internalName = (room.strategies || []).find((it) => String(it.internalRoomTypeName || '').trim())?.internalRoomTypeName;
  return (
    String(room.roomTypeName || '').trim()
    || String(strategyBasedName || '').trim()
    || String(internalName || '').trim()
    || room.platformRoomTypeId
  );
};

const getAtourPlaceName = (item: AtourPlaceItem) => {
  const title = String(item.title || '').trim();
  const chainName = String(item.chainName || '').trim();
  const subTitle = String(item.subTitle || '').trim();
  const chainId = String(item.chainId || '').trim();
  return title || chainName || subTitle || chainId || '未命名酒店';
};

export const FeizhuProductCenter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [items, setItems] = useState<HotelNode[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedStrategyKey, setSelectedStrategyKey] = useState('');
  const [collapsedHotels, setCollapsedHotels] = useState<string[]>([]);
  const [collapsedRooms, setCollapsedRooms] = useState<string[]>([]);
  const [draft, setDraft] = useState<StrategyDraft>(defaultDraft());
  const [atourKeyword, setAtourKeyword] = useState('');
  const [atourSearching, setAtourSearching] = useState(false);
  const [atourResults, setAtourResults] = useState<AtourPlaceItem[]>([]);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [hotelShid, setHotelShid] = useState('');

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
      const prefix = data?.code ? `${data.code}: ` : '';
      throw new Error(`${prefix}${data.message || '请求失败'}`);
    }
    return data;
  };

  const loadTree = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWithAuth('/api/ota/product-center/tree?platform=FLIGGY');
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载飞猪商品数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  const selectedHotel = useMemo(
    () => items.find((hotel) => hotel.platformHotelId === selectedHotelId) || null,
    [items, selectedHotelId]
  );

  const selectedRoom = useMemo(
    () => selectedHotel?.rooms?.find((room) => room.platformRoomTypeId === selectedRoomId) || null,
    [selectedHotel, selectedRoomId]
  );

  const handleSelectHotel = (hotelId: string) => {
    setSelectedHotelId(hotelId);
    setSelectedRoomId('');
    setSelectedStrategyKey('');
    setDraft(defaultDraft());
    setCollapsedHotels((prev) => prev.filter((it) => it !== hotelId));
    const hotel = items.find((it) => it.platformHotelId === hotelId);
    setHotelShid(String(hotel?.mapping?.shid || ''));
  };

  const handleSelectRoom = (hotelId: string, roomId: string) => {
    setSelectedHotelId(hotelId);
    setSelectedRoomId(roomId);
    setSelectedStrategyKey('');
    const room = items
      .find((hotel) => hotel.platformHotelId === hotelId)
      ?.rooms.find((it) => it.platformRoomTypeId === roomId);
    const first = room?.strategies?.[0] || null;
    setDraft({
      platformHotelId: hotelId,
      platformRoomTypeId: roomId,
      platformChannel: first?.platformChannel || 'DEFAULT',
      rateCode: first?.rateCode || '',
      srid: first?.srid || '',
      breakfastCount: Number(first?.breakfastCount ?? 0) || 0,
      guaranteeType: Number(first?.guaranteeType ?? 0) || 0,
      cancelPolicyCal: safeJsonStringify(first?.cancelPolicyCal)
    });
    setCollapsedHotels((prev) => prev.filter((it) => it !== hotelId));
    setCollapsedRooms((prev) => prev.filter((it) => it !== `${hotelId}::${roomId}`));
  };

  const handleSelectStrategy = (hotelId: string, roomId: string, strategy: StrategyNode) => {
    setSelectedHotelId(hotelId);
    setSelectedRoomId(roomId);
    setSelectedStrategyKey(`${strategy.platformChannel}::${strategy.rateCode}`);
    setDraft({
      platformHotelId: hotelId,
      platformRoomTypeId: roomId,
      platformChannel: strategy.platformChannel || 'DEFAULT',
      rateCode: strategy.rateCode || '',
      srid: strategy.srid || '',
      breakfastCount: Number(strategy.breakfastCount ?? 0) || 0,
      guaranteeType: Number(strategy.guaranteeType ?? 0) || 0,
      cancelPolicyCal: safeJsonStringify(strategy.cancelPolicyCal)
    });
  };

  const toggleHotelCollapsed = (hotelId: string) => {
    setCollapsedHotels((prev) => (prev.includes(hotelId) ? prev.filter((it) => it !== hotelId) : [...prev, hotelId]));
  };

  const toggleRoomCollapsed = (hotelId: string, roomId: string) => {
    const key = `${hotelId}::${roomId}`;
    setCollapsedRooms((prev) => (prev.includes(key) ? prev.filter((it) => it !== key) : [...prev, key]));
  };

  const handleSaveAndPublish = async () => {
    setError('');
    setNotice('');

    if (!draft.platformHotelId || !draft.platformRoomTypeId) {
      setError('请先选择酒店和房型');
      return;
    }
    if (!draft.rateCode.trim()) {
      setError('请填写价格政策编码（rateplanCode）');
      return;
    }
    if (!Number.isFinite(Number(draft.breakfastCount)) || Number(draft.breakfastCount) < 0) {
      setError('早餐份数必须为大于等于 0 的数字');
      return;
    }
    if (!Number.isFinite(Number(draft.guaranteeType)) || Number(draft.guaranteeType) < 0) {
      setError('担保类型必须为大于等于 0 的数字');
      return;
    }

    let cancelPolicyCal: unknown = null;
    try {
      cancelPolicyCal = parseJsonText(draft.cancelPolicyCal);
    } catch {
      setError('取消政策 JSON 格式不正确');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        platform: 'FLIGGY',
        strategy: {
          platform: 'FLIGGY',
          platformHotelId: draft.platformHotelId,
          platformRoomTypeId: draft.platformRoomTypeId,
          platformRoomTypeName: selectedRoom?.roomTypeName || draft.platformRoomTypeId,
          internalRoomTypeId: '',
          internalRoomTypeName: '',
          platformChannel: draft.platformChannel || 'DEFAULT',
          rateCode: draft.rateCode.trim(),
          srid: draft.srid.trim() || null,
          breakfastCount: Number(draft.breakfastCount) || 0,
          guaranteeType: Number(draft.guaranteeType) || 0,
          cancelPolicyCal,
          enabled: true
        },
        publishProduct: {
          platformHotelId: draft.platformHotelId,
          platformRoomTypeId: draft.platformRoomTypeId,
          rateplanCode: draft.rateCode.trim()
        }
      };

      const result = await fetchWithAuth('/api/ota/product-center/strategies/save-and-publish', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const publishStatus = String(result?.strategy?.publishStatus || 'DRAFT').toUpperCase();
      setNotice(publishStatus === 'PUBLISHED' ? '发布成功' : `已保存，当前状态：${publishStatus}`);
      await loadTree();
      setSelectedStrategyKey(`${payload.strategy.platformChannel}::${payload.strategy.rateCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存并发布失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAtourSearch = async () => {
    const keyword = atourKeyword.trim();
    if (!keyword) {
      setAtourResults([]);
      return;
    }
    setAtourSearching(true);
    setError('');
    try {
      const data = await fetchWithAuth(`/api/hotels/place-search?keyword=${encodeURIComponent(keyword)}`);
      const items = Array.isArray(data?.hotels) ? data.hotels : Array.isArray(data?.items) ? data.items : [];
      setAtourResults(items as AtourPlaceItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '亚朵搜索失败');
      setAtourResults([]);
    } finally {
      setAtourSearching(false);
    }
  };

  const handleImportAtour = async (item: AtourPlaceItem) => {
    setError('');
    setNotice('');
    try {
      await fetchWithAuth('/api/ota/product-center/import-atour', {
        method: 'POST',
        body: JSON.stringify({
          platform: 'FLIGGY',
          atour: {
            chainId: item.chainId || '',
            chainName: item.chainName || '',
            title: item.title || '',
            subTitle: item.subTitle || '',
            cityName: item.cityName || ''
          }
        })
      });
      setNotice('导入成功');
      await loadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    }
  };

  const handleSaveHotelShid = async () => {
    if (!selectedHotelId) {
      setError('请先选择酒店');
      return;
    }
    setMappingSaving(true);
    setError('');
    setNotice('');
    try {
      await fetchWithAuth('/api/ota/product-center/mappings/hotel-shid', {
        method: 'POST',
        body: JSON.stringify({
          platform: 'FLIGGY',
          platformHotelId: selectedHotelId,
          platformHotelName: selectedHotel ? getHotelDisplayName(selectedHotel) : selectedHotelId,
          shid: hotelShid.trim() || null,
          internalChainId: '',
          internalHotelName: ''
        })
      });
      setNotice('酒店 SHID 已保存');
      await loadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存酒店 SHID 失败');
    } finally {
      setMappingSaving(false);
    }
  };

  const handleRetryPublish = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await fetchWithAuth('/api/ota/product-center/publish/retry', {
        method: 'POST',
        body: JSON.stringify({
          platform: 'FLIGGY',
          strategy: {
            platform: 'FLIGGY',
            platformHotelId: draft.platformHotelId,
            platformRoomTypeId: draft.platformRoomTypeId,
            platformRoomTypeName: selectedRoom?.roomTypeName || draft.platformRoomTypeId,
            internalRoomTypeId: '',
            internalRoomTypeName: '',
            platformChannel: draft.platformChannel || 'DEFAULT',
            rateCode: draft.rateCode.trim(),
            srid: draft.srid.trim() || null,
            breakfastCount: Number(draft.breakfastCount) || 0,
            guaranteeType: Number(draft.guaranteeType) || 0,
            cancelPolicyCal: parseJsonText(draft.cancelPolicyCal),
            enabled: true
          },
          publishProduct: {
            platformHotelId: draft.platformHotelId,
            platformRoomTypeId: draft.platformRoomTypeId,
            rateplanCode: draft.rateCode.trim()
          }
        })
      });
      setNotice('重试发布已执行');
      await loadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重试发布失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">飞猪商品管理</h1>
        <p className="mt-2 text-sm text-gray-500">酒店/房型/策略商品本地管理与上架到飞猪（建设中）</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">酒店 / 房型 / 策略</h2>
            <button
              type="button"
              onClick={loadTree}
              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              刷新
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-gray-500">正在加载...</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">暂无数据</div>
          ) : (
            <div className="space-y-2">
              {items.map((hotel) => {
                const hotelCollapsed = collapsedHotels.includes(hotel.platformHotelId);
                return (
                  <div key={hotel.platformHotelId} className="rounded border border-gray-100">
                    <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-2">
                      <button
                        type="button"
                        className="text-xs text-gray-500"
                        onClick={() => toggleHotelCollapsed(hotel.platformHotelId)}
                      >
                        {hotelCollapsed ? '▸' : '▾'}
                      </button>
                      <button
                        type="button"
                        data-testid={`hotel-node-${hotel.platformHotelId}`}
                        onClick={() => handleSelectHotel(hotel.platformHotelId)}
                        className={`flex-1 text-left text-sm ${selectedHotelId === hotel.platformHotelId ? 'font-semibold text-blue-700' : 'text-gray-800'}`}
                      >
                        <div className="truncate">{getHotelDisplayName(hotel)}</div>
                        <div className="text-[11px] font-mono text-gray-400">{hotel.platformHotelId}</div>
                      </button>
                    </div>

                    {!hotelCollapsed && (
                      <div className="space-y-1 px-3 py-2">
                        {(hotel.rooms || []).map((room) => {
                          const roomKey = `${hotel.platformHotelId}::${room.platformRoomTypeId}`;
                          const roomCollapsed = collapsedRooms.includes(roomKey);
                          return (
                            <div key={roomKey} className="rounded border border-gray-100">
                              <div className="flex items-center gap-2 px-2 py-1.5">
                                <button type="button" className="text-xs text-gray-500" onClick={() => toggleRoomCollapsed(hotel.platformHotelId, room.platformRoomTypeId)}>
                                  {roomCollapsed ? '▸' : '▾'}
                                </button>
                                <button
                                  type="button"
                                  data-testid={`room-node-${room.platformRoomTypeId}`}
                                  onClick={() => handleSelectRoom(hotel.platformHotelId, room.platformRoomTypeId)}
                                  className={`flex-1 text-left text-sm ${selectedRoomId === room.platformRoomTypeId ? 'font-semibold text-blue-700' : 'text-gray-700'}`}
                                >
                                  <div className="truncate">{getRoomDisplayName(room)}</div>
                                  <div className="text-[11px] font-mono text-gray-400">{room.platformRoomTypeId}</div>
                                </button>
                              </div>
                              {!roomCollapsed && (
                                <div className="space-y-1 pb-2 pl-7 pr-2">
                                  {(room.strategies || []).map((strategy) => {
                                    const key = `${strategy.platformChannel}::${strategy.rateCode}`;
                                    return (
                                      <button
                                        key={`${roomKey}::${key}`}
                                        type="button"
                                        onClick={() => handleSelectStrategy(hotel.platformHotelId, room.platformRoomTypeId, strategy)}
                                        className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${selectedStrategyKey === key ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
                                      >
                                        <span>{strategy.rateCode || '未命名策略'}</span>
                                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${publishBadge(strategy.publishStatus)}`}>
                                          {String(strategy.publishStatus || 'DRAFT').toUpperCase()}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-sm font-semibold text-gray-900">亚朵酒店导入</div>
            <div className="mt-2 flex gap-2">
              <input
                value={atourKeyword}
                onChange={(e) => setAtourKeyword(e.target.value)}
                className="flex-1 rounded border border-gray-200 px-2 py-2 text-sm"
                placeholder="输入关键词搜索亚朵酒店"
              />
              <button
                type="button"
                onClick={handleAtourSearch}
                className="rounded border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-white"
              >
                {atourSearching ? '搜索中...' : '搜索'}
              </button>
            </div>
            {atourResults.length > 0 && (
              <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded border border-gray-100 bg-white p-2">
                {atourResults.map((item) => (
                  <div key={`${item.id || ''}-${item.chainId || ''}-${item.title || ''}-${item.chainName || ''}`} className="flex items-center justify-between rounded border border-gray-100 px-2 py-2 text-xs">
                    <div>
                      <div className="font-medium text-gray-800">{getAtourPlaceName(item)}</div>
                      <div className="font-mono text-[11px] text-gray-400">{item.chainId || '-'}</div>
                      <div className="text-gray-500">{item.cityName || '-'} {item.address || ''}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleImportAtour(item)}
                      className="rounded border border-blue-200 px-2 py-1 text-blue-700 hover:bg-blue-50"
                    >
                      导入
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-sm font-semibold text-gray-900">酒店映射维护（SHID）</div>
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
              <input
                value={hotelShid}
                onChange={(e) => setHotelShid(e.target.value)}
                className="rounded border border-gray-200 px-2 py-2 text-sm"
                placeholder="输入 SHID（先在左侧选择酒店）"
              />
              <button
                type="button"
                disabled={mappingSaving}
                onClick={handleSaveHotelShid}
                className="rounded border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                保存 SHID
              </button>
            </div>
          </div>

          <h2 className="text-sm font-semibold text-gray-900">策略编辑与发布</h2>
          {!selectedRoom ? (
            <div className="mt-4 rounded border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              请先在左侧选择一个房型
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-gray-500">酒店</div>
                  <div className="mt-1 rounded border border-gray-200 bg-gray-50 px-2 py-2 text-sm">
                    {selectedHotel ? getHotelDisplayName(selectedHotel) : draft.platformHotelId}
                    <span className="ml-2 text-xs text-gray-400">{draft.platformHotelId}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">房型</div>
                  <div className="mt-1 rounded border border-gray-200 bg-gray-50 px-2 py-2 text-sm">
                    {selectedRoom ? getRoomDisplayName(selectedRoom) : draft.platformRoomTypeId}
                    <span className="ml-2 text-xs text-gray-400">{draft.platformRoomTypeId}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500" htmlFor="rateplan-code">价格政策编码 *</label>
                  <input
                    id="rateplan-code"
                    data-testid="input-rateplan-code"
                    value={draft.rateCode}
                    onChange={(e) => setDraft((prev) => ({ ...prev, rateCode: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm"
                    placeholder="如：RATE_DEFAULT"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500" htmlFor="platform-channel">渠道</label>
                  <input
                    id="platform-channel"
                    value={draft.platformChannel}
                    onChange={(e) => setDraft((prev) => ({ ...prev, platformChannel: e.target.value.toUpperCase() || 'DEFAULT' }))}
                    className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm"
                    placeholder="DEFAULT"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500" htmlFor="srid">SRID</label>
                  <input
                    id="srid"
                    value={draft.srid}
                    onChange={(e) => setDraft((prev) => ({ ...prev, srid: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm"
                    placeholder="标准房型ID"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500" htmlFor="breakfast-count">早餐份数 *</label>
                  <input
                    id="breakfast-count"
                    data-testid="input-breakfast-count"
                    type="number"
                    min={0}
                    value={draft.breakfastCount}
                    onChange={(e) => setDraft((prev) => ({ ...prev, breakfastCount: Math.max(0, Number(e.target.value) || 0) }))}
                    className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500" htmlFor="guarantee-type">担保类型 *</label>
                  <select
                    id="guarantee-type"
                    data-testid="select-guarantee-type"
                    value={draft.guaranteeType}
                    onChange={(e) => setDraft((prev) => ({ ...prev, guaranteeType: Number(e.target.value) || 0 }))}
                    className="mt-1 w-full rounded border border-gray-200 px-2 py-2 text-sm"
                  >
                    <option value={0}>0 - 无担保</option>
                    <option value={1}>1 - 首晚担保</option>
                    <option value={2}>2 - 全额担保</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500" htmlFor="cancel-policy">取消政策(JSON) *</label>
                <textarea
                  id="cancel-policy"
                  data-testid="textarea-cancel-policy"
                  value={draft.cancelPolicyCal}
                  onChange={(e) => setDraft((prev) => ({ ...prev, cancelPolicyCal: e.target.value }))}
                  className="mt-1 h-28 w-full rounded border border-gray-200 px-2 py-2 font-mono text-xs"
                  placeholder='例如: {"rule":"18:00前可免罚取消"}'
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  data-testid="btn-save-publish"
                  disabled={saving}
                  onClick={handleSaveAndPublish}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? '处理中...' : '保存并发布'}
                </button>
                <button
                  type="button"
                  data-testid="btn-retry-publish"
                  disabled={saving}
                  onClick={handleRetryPublish}
                  className="rounded border border-amber-200 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  重试发布
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(defaultDraft())}
                  className="rounded border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  重置
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
