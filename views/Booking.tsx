
import React, { useState, useEffect, useRef } from 'react';
import { DateRangePicker } from '../components/DateRangePicker';
import { Hotel, RatePlan, Room } from '../types';
import { BookingDetailView } from './booking/BookingDetailView';
import { BookingConfirmView } from './booking/BookingConfirmView';
import { InvoiceFormSheet, InvoiceFormValue } from '../components/InvoiceFormSheet';

type BookingStep = 'SEARCH' | 'DETAIL' | 'CONFIRM';

interface PlaceSuggestion {
  id: string;
  type: number;
  chainId: string | null;
  title: string;
  subTitle: string;
  cityName: string;
  address: string;
}

export const Booking: React.FC = () => {
  const TOKEN_KEY = 'skyhotel_auth_token';
  const [step, setStep] = useState<BookingStep>('SEARCH');
  const [showDatePicker, setShowDatePicker] = useState(false); // New state for calendar
  
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [selectedRate, setSelectedRate] = useState<RatePlan | null>(null);
  
  // Manage expanded rooms in Detail View
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(new Set());
  // Loading state for fetching rates
  const [isRatesLoading, setIsRatesLoading] = useState(false);
  // Copy Toast State
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useState({
    checkIn: new Date().toISOString().split('T')[0],
    checkOut: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    keyword: ''
  });

  const [bookingForm, setBookingForm] = useState({
    guestName: '刘', // Mock default user
    guestPhone: '181****1023',
    note: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggestionLoading, setIsSuggestionLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const suggestionSeqRef = useRef(0);
  const suppressNextSuggestFetchRef = useRef(false);
  const detailReqSeqRef = useRef(0);

  // New state for Benefits in Confirm View
  const [selectedBenefits, setSelectedBenefits] = useState({
    breakfast: 1, 
    upgrade: 0,
    lateCheckout: 0,
    slippers: 1
  });
  const [appliedCoupon, setAppliedCoupon] = useState<{name: string, value: number} | null>(null);
  const [invoiceEnabled, setInvoiceEnabled] = useState(false);
  const [showInvoiceSheet, setShowInvoiceSheet] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormValue>({
    type: 'NORMAL',
    titleType: 'PERSONAL',
    title: '',
    taxNo: '',
    companyAddress: '',
    companyPhone: '',
    bankName: '',
    bankAccount: '',
    email: '',
    specialRequestEnabled: false,
    specialRequestNote: ''
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

      const response = await fetch(url, {
          ...options,
          headers
      });

      if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || '请求失败');
      }

      return response.json();
  };

  const isBookablePlace = (item: PlaceSuggestion) => item.type === 0 && Boolean(item.chainId);

  useEffect(() => {
      const onClickOutside = (event: MouseEvent) => {
          if (!searchBoxRef.current) {
              return;
          }
          if (!searchBoxRef.current.contains(event.target as Node)) {
              setShowSuggestions(false);
          }
      };

      document.addEventListener('mousedown', onClickOutside);
      return () => {
          document.removeEventListener('mousedown', onClickOutside);
      };
  }, []);

  useEffect(() => {
      const keyword = searchParams.keyword.trim();
      if (keyword.length < 2) {
          setSuggestions([]);
          setIsSuggestionLoading(false);
          setShowSuggestions(false);
          return;
      }

      if (suppressNextSuggestFetchRef.current) {
          suppressNextSuggestFetchRef.current = false;
          setIsSuggestionLoading(false);
          return;
      }

      const currentSeq = suggestionSeqRef.current + 1;
      suggestionSeqRef.current = currentSeq;
      const controller = new AbortController();
      const timer = setTimeout(async () => {
          setIsSuggestionLoading(true);
          try {
              const data = await fetchWithAuth(`/api/hotels/place-search?keyword=${encodeURIComponent(keyword)}`, {
                  signal: controller.signal
              });
              if (suggestionSeqRef.current !== currentSeq) {
                  return;
              }
              const items = Array.isArray(data.items) ? data.items.filter(isBookablePlace) : [];
              setSuggestions(items);
              const isSameAsSelected = Boolean(selectedPlace && selectedPlace.title === keyword);
              const isInputFocused = searchInputRef.current
                ? document.activeElement === searchInputRef.current
                : true;
              setShowSuggestions(items.length > 0 && !isSameAsSelected && isInputFocused);
          } catch (error) {
              if (error instanceof DOMException && error.name === 'AbortError') {
                  return;
              }
              if (suggestionSeqRef.current !== currentSeq) {
                  return;
              }
              setSuggestions([]);
              setShowSuggestions(false);
          } finally {
              if (suggestionSeqRef.current === currentSeq) {
                  setIsSuggestionLoading(false);
              }
          }
      }, 320);

      return () => {
          clearTimeout(timer);
          controller.abort();
      };
  }, [searchParams.keyword]);

  const runSearch = async (placeOverride?: PlaceSuggestion | null) => {
      const targetPlace = placeOverride || selectedPlace;
      if (!targetPlace || !isBookablePlace(targetPlace)) {
          setSearchError('请先从下拉中选择酒店结果后再预订');
          return;
      }

      setIsSearchLoading(true);
      setSearchError('');
      try {
          const data = await fetchWithAuth('/api/hotels/detail', {
              method: 'POST',
              body: JSON.stringify({
                  chainId: targetPlace.chainId,
                  beginDate: searchParams.checkIn,
                  endDate: searchParams.checkOut,
                  name: targetPlace.title,
                  address: targetPlace.address,
                  cityName: targetPlace.cityName
              })
          });

          const targetHotel = data.hotel as Hotel | undefined;
          if (!targetHotel) {
              throw new Error('未获取到酒店详情，请稍后重试');
          }

          setSelectedHotel(targetHotel);
          setSelectedRoom(null);
          setSelectedRate(null);
          setStep('DETAIL');
      } catch (err: any) {
          setSearchError(err.message || '搜索失败，请稍后重试');
      } finally {
          setIsSearchLoading(false);
      }
  };

  const handleDateConfirm = async (start: string, end: string) => {
    setSearchParams(prev => ({ ...prev, checkIn: start, checkOut: end }));
    setExpandedRoomIds(new Set());

    if (step !== 'DETAIL' && step !== 'CONFIRM') {
      return;
    }

    const targetPlace =
      (selectedPlace && isBookablePlace(selectedPlace))
        ? selectedPlace
        : (selectedHotel?.chainId
            ? {
                id: `selected-${selectedHotel.chainId}`,
                type: 0,
                chainId: selectedHotel.chainId,
                title: selectedHotel.name,
                subTitle: '',
                cityName: selectedHotel.location || '',
                address: selectedHotel.address || ''
              }
            : null);

    if (!targetPlace || !isBookablePlace(targetPlace)) {
      return;
    }

    const reqSeq = detailReqSeqRef.current + 1;
    detailReqSeqRef.current = reqSeq;
    setIsRatesLoading(true);
    setSearchError('');

    try {
      const data = await fetchWithAuth('/api/hotels/detail', {
        method: 'POST',
        body: JSON.stringify({
          chainId: targetPlace.chainId,
          beginDate: start,
          endDate: end,
          name: targetPlace.title,
          address: targetPlace.address,
          cityName: targetPlace.cityName
        })
      });

      if (detailReqSeqRef.current !== reqSeq) {
        return;
      }

      const refreshedHotel = data.hotel as Hotel | undefined;
      if (!refreshedHotel) {
        throw new Error('更新日期后未获取到酒店详情');
      }

      setSelectedHotel(refreshedHotel);

      if (selectedRoom && selectedRate) {
        const refreshedRoom = refreshedHotel.rooms.find((room) => room.id === selectedRoom.id) || null;
        const refreshedRate = refreshedRoom?.rates.find((rate) => rate.id === selectedRate.id) || null;

        if (refreshedRoom && refreshedRate) {
          setSelectedRoom(refreshedRoom);
          setSelectedRate(refreshedRate);
        } else {
          setSelectedRoom(null);
          setSelectedRate(null);
          if (step === 'CONFIRM') {
            setStep('DETAIL');
          }
          setSearchError('该日期下原房型或价格不可订，请重新选择');
        }
      }
    } catch (err: any) {
      if (detailReqSeqRef.current !== reqSeq) {
        return;
      }
      setSearchError(err.message || '日期更新失败，请稍后重试');
    } finally {
      if (detailReqSeqRef.current === reqSeq) {
        setIsRatesLoading(false);
      }
    }
  };

  // Auto-apply coupon when entering Confirm step
  useEffect(() => {
    if (step === 'CONFIRM') {
      // Mock logic: randomly auto-apply a store coupon
      const bestCoupon = { name: '门店优惠券', value: 30 };
      setAppliedCoupon(bestCoupon);
      // Reset benefits if needed, or keep defaults
    }
  }, [step]);

  // Helper to calculate nights
  const getNightCount = () => {
     const start = new Date(searchParams.checkIn);
     const end = new Date(searchParams.checkOut);
     return Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) || 1;
  };

  const getDisplayDate = (dateStr: string) => {
      const d = new Date(dateStr);
      return `${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`;
  }

  // --- Quote Generation Helpers ---

  const handleCopyText = (text: string, message: string = '文案已复制') => {
      navigator.clipboard.writeText(text);
      setCopyMessage(message);
      setTimeout(() => setCopyMessage(null), 2000);
  };

  const generateSingleQuote = (hotel: Hotel, room: Room, rate: RatePlan) => {
      const nights = getNightCount();
      const tags = rate.tags.join('、');
      return `【${hotel.name}】\n📍房型：${room.name} (${rate.name})\n📅日期：${getDisplayDate(searchParams.checkIn)} - ${getDisplayDate(searchParams.checkOut)} (${nights}晚)\n💰价格：¥${rate.price}/晚 (总价 ¥${rate.price * nights})\n🎁礼遇：${tags || '常规权益'}\n\n需二次确认，手慢无！`;
  };

  const generateHotelQuote = (hotel: Hotel) => {
      const nights = getNightCount();
      let roomList = '';
      hotel.rooms.forEach((r, index) => {
          const minRate = Math.min(...r.rates.map(rp => rp.price));
          roomList += `${index + 1}️⃣ ${r.name}：¥${minRate}起\n`;
      });

      return `【特价推荐】${hotel.name}\n📍地址：${hotel.location}\n📅日期：${getDisplayDate(searchParams.checkIn)} - ${getDisplayDate(searchParams.checkOut)} (${nights}晚)\n\n${roomList}\n🔥独家优势：${hotel.tags.slice(0, 3).join(' | ')}\n------------------------------\n更多房型及精准报价请私聊！`;
  };

  const submitBooking = () => {
      setIsLoading(true);
      setTimeout(() => {
          setIsLoading(false);
          setSuccess(true);
          setTimeout(() => {
              setSuccess(false);
              setStep('SEARCH');
              setExpandedRoomIds(new Set());
          }, 2000);
      }, 1500);
  };

  const updateBenefit = (type: keyof typeof selectedBenefits, delta: number) => {
      const current = selectedBenefits[type];
      const max = type === 'breakfast' ? 2 : type === 'slippers' ? 3 : type === 'upgrade' ? 1 : 2;
      const next = Math.max(0, Math.min(max, current + delta));
      setSelectedBenefits({ ...selectedBenefits, [type]: next });
  };

  // --- Views ---

  // 1. Search Landing Page
  const renderSearch = () => (
    <div className="h-full flex flex-col items-center relative">
      <DateRangePicker 
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onConfirm={handleDateConfirm}
        initialStartDate={searchParams.checkIn}
        initialEndDate={searchParams.checkOut}
      />
      
      {/* Background Image Header */}
      <div className="w-full h-64 bg-slate-900 absolute top-0 left-0 z-0 overflow-hidden">
        <img 
            src="https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?ixlib=rb-4.0.3&auto=format&fit=crop&w=2613&q=80" 
            alt="City" 
            className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-50 to-transparent"></div>
      </div>

      {/* Search Card */}
      <div className="w-full max-w-lg z-10 mt-16 px-4">
          <div className="bg-white rounded-3xl shadow-xl p-6 space-y-6">
              {/* Date Row (Clickable) */}
              <div 
                className="flex items-center justify-between border-b border-gray-100 pb-4 cursor-pointer hover:bg-gray-50 transition-colors rounded p-1"
                onClick={() => setShowDatePicker(true)}
              >
                  <div>
                      <p className="text-xs text-gray-400 mb-1">入住</p>
                      <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold text-gray-900">{getDisplayDate(searchParams.checkIn)}</span>
                          <span className="text-xs text-gray-500">今天</span>
                      </div>
                  </div>
                  <div className="bg-gray-100 px-2 py-0.5 rounded text-xs text-gray-600">
                    {getNightCount()}晚
                  </div>
                  <div className="text-right">
                      <p className="text-xs text-gray-400 mb-1">离店</p>
                      <div className="flex items-baseline gap-2 justify-end">
                          <span className="text-lg font-bold text-gray-900">{getDisplayDate(searchParams.checkOut)}</span>
                          <span className="text-xs text-gray-500">明天</span>
                      </div>
                  </div>
              </div>

              {/* Search Keyword */}
              <div className="flex flex-col gap-2" ref={searchBoxRef}>
                  <input 
                    ref={searchInputRef}
                    type="text" 
                    placeholder="输入酒店或地标，边输入边搜索" 
                    className="w-full text-lg font-medium placeholder-gray-300 outline-none"
                    value={searchParams.keyword}
                    onFocus={() => {
                        const isSameAsSelected = Boolean(
                          selectedPlace && selectedPlace.title === searchParams.keyword.trim()
                        );
                        if (suggestions.length > 0 && !isSameAsSelected) {
                            setShowSuggestions(true);
                        }
                    }}
                    onChange={e => {
                        const value = e.target.value;
                        suppressNextSuggestFetchRef.current = false;
                        setSearchParams((prev) => ({ ...prev, keyword: value }));
                        setSelectedPlace(null);
                        setShowSuggestions(value.trim().length >= 2);
                    }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const firstBookable = suggestions.find(isBookablePlace);
                            if (!selectedPlace && firstBookable) {
                                suppressNextSuggestFetchRef.current = true;
                                suggestionSeqRef.current += 1;
                                setSelectedPlace(firstBookable);
                                setSearchParams((prev) => ({ ...prev, keyword: firstBookable.title }));
                                setShowSuggestions(false);
                                runSearch(firstBookable);
                                return;
                            }
                            runSearch();
                        }
                    }}
                  />

                  {showSuggestions && (
                    <div className="bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-auto">
                      {isSuggestionLoading && (
                        <div className="px-3 py-3 text-xs text-gray-400">搜索中...</div>
                      )}

                      {!isSuggestionLoading && suggestions.length === 0 && searchParams.keyword.trim().length >= 2 && (
                        <div className="px-3 py-3 text-xs text-gray-400">暂无匹配结果</div>
                      )}

                      {!isSuggestionLoading && suggestions.map((item) => {
                        const isActive = selectedPlace?.id === item.id;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              suppressNextSuggestFetchRef.current = true;
                              suggestionSeqRef.current += 1;
                              setSelectedPlace(item);
                              setSearchParams((prev) => ({ ...prev, keyword: item.title }));
                              setShowSuggestions(false);
                            }}
                            className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-b-0 transition-colors ${
                              isActive
                                ? 'bg-blue-50'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                                酒店
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-500 truncate mt-0.5">
                              {item.subTitle || item.address || item.cityName || '-'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedPlace && isBookablePlace(selectedPlace) && (
                    <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      已选酒店：{selectedPlace.title}（chainId: {selectedPlace.chainId}）
                    </div>
                  )}

              </div>

              {/* Action Button */}
              <button 
                onClick={() => runSearch()}
                disabled={isSearchLoading || !selectedPlace || !isBookablePlace(selectedPlace)}
                className="w-full bg-slate-800 text-amber-50 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  {isSearchLoading ? '搜索中...' : '立即预订'}
              </button>

              {searchError && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {searchError}
                </div>
              )}
          </div>
      </div>
    </div>
  );

  const renderHotelDetail = () => {
    if (!selectedHotel) return null;

    return (
      <BookingDetailView
        selectedHotel={selectedHotel}
        checkIn={searchParams.checkIn}
        checkOut={searchParams.checkOut}
        showDatePicker={showDatePicker}
        onCloseDatePicker={() => setShowDatePicker(false)}
        onDateConfirm={handleDateConfirm}
        copyMessage={copyMessage}
        onBack={() => setStep('SEARCH')}
        onCopyHotelQuote={() => handleCopyText(generateHotelQuote(selectedHotel), '整店文案已复制')}
        onOpenDatePicker={() => setShowDatePicker(true)}
        getDisplayDate={getDisplayDate}
        getNightCount={getNightCount}
        isRatesLoading={isRatesLoading}
        expandedRoomIds={expandedRoomIds}
        onToggleRoom={(roomId) => {
          const newSet = new Set(expandedRoomIds);
          if (newSet.has(roomId)) newSet.delete(roomId);
          else newSet.add(roomId);
          setExpandedRoomIds(newSet);
        }}
        onCopyRateQuote={(room, rate) => handleCopyText(generateSingleQuote(selectedHotel, room, rate), '单品报价已复制')}
        onSelectRate={(room, rate) => {
          setSelectedRoom(room);
          setSelectedRate(rate);
          setStep('CONFIRM');
        }}
        errorMessage={searchError}
      />
    );
  };

  const renderBookingForm = () => {
    if (!selectedHotel || !selectedRoom || !selectedRate) return null;

    return (
      <>
        <BookingConfirmView
          selectedHotel={selectedHotel}
          selectedRoom={selectedRoom}
          selectedRate={selectedRate}
          checkIn={searchParams.checkIn}
          checkOut={searchParams.checkOut}
          bookingForm={bookingForm}
          onBookingFormChange={(patch) => setBookingForm({ ...bookingForm, ...patch })}
          selectedBenefits={selectedBenefits}
          onUpdateBenefit={updateBenefit}
          appliedCoupon={appliedCoupon}
          invoiceEnabled={invoiceEnabled}
          invoiceForm={invoiceForm}
          onToggleInvoice={() => {
            if (invoiceEnabled) {
              setInvoiceEnabled(false);
              return;
            }
            setShowInvoiceSheet(true);
          }}
          onBack={() => setStep('DETAIL')}
          onSubmit={submitBooking}
          isLoading={isLoading}
          getDisplayDate={getDisplayDate}
          getNightCount={getNightCount}
        />
        <InvoiceFormSheet
          isOpen={showInvoiceSheet}
          initialValue={invoiceForm}
          onClose={() => setShowInvoiceSheet(false)}
          onConfirm={(nextInvoiceForm) => {
            setInvoiceForm(nextInvoiceForm);
            setInvoiceEnabled(true);
            setShowInvoiceSheet(false);
          }}
        />
      </>
    );
  }

  // Success Overlay
  if (success) {
      return (
          <div className="h-full flex items-center justify-center bg-gray-50">
              <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                      ✓
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">预订成功</h2>
                  <p className="text-gray-500 mb-6">订单已发送至酒店，稍后请留意短信通知。</p>
              </div>
          </div>
      )
  }

  // Router Logic
  switch(step) {
      case 'SEARCH': return renderSearch();
      case 'DETAIL': return renderHotelDetail();
      case 'CONFIRM': return renderBookingForm();
      default: return renderSearch();
  }
};
