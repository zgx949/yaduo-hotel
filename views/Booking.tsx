
import React, { useState, useEffect, useRef } from 'react';
import { DateRangePicker } from '../components/DateRangePicker';
import { Hotel, RatePlan, Room, OrderPaymentDecision, OrderPaymentPrepareSplit } from '../types';
import { BookingDetailView } from './booking/BookingDetailView';
import { BookingConfirmView } from './booking/BookingConfirmView';
import { InvoiceFormSheet, InvoiceFormValue } from '../components/InvoiceFormSheet';

type BookingStep = 'SEARCH' | 'DETAIL' | 'CONFIRM';
type PaymentFlowStage = 'IDLE' | 'DECISION' | 'PREPARING' | 'LIST';

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
  const [successMessage, setSuccessMessage] = useState('');
  const [paymentFlowStage, setPaymentFlowStage] = useState<PaymentFlowStage>('IDLE');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [paymentDecision, setPaymentDecision] = useState<OrderPaymentDecision | null>(null);
  const [paymentSplits, setPaymentSplits] = useState<OrderPaymentPrepareSplit[]>([]);
  const [paymentFlowMessage, setPaymentFlowMessage] = useState('');
  const [payingItemId, setPayingItemId] = useState('');
  const [isPaymentSyncing, setIsPaymentSyncing] = useState(false);
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
  const paymentPollTimerRef = useRef<number | null>(null);

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

  const clearPaymentPoll = () => {
    if (paymentPollTimerRef.current) {
      window.clearTimeout(paymentPollTimerRef.current);
      paymentPollTimerRef.current = null;
    }
  };

  const resetPaymentFlow = () => {
    clearPaymentPoll();
    setPaymentFlowStage('IDLE');
    setPaymentDecision(null);
    setPaymentSplits([]);
    setActiveOrderId(null);
    setPaymentFlowMessage('');
    setPayingItemId('');
    setIsPaymentSyncing(false);
  };

  const finishBookingFlow = (message: string) => {
    resetPaymentFlow();
    setSuccessMessage(message);
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setStep('SEARCH');
      setExpandedRoomIds(new Set());
    }, 1800);
  };

  const fetchPaymentPrepare = async (orderId: string, waitForReady: boolean) => {
    return fetchWithAuth(`/api/orders/${orderId}/payment/prepare`, {
      method: 'POST',
      body: JSON.stringify({ waitForReady, timeoutMs: 20000 })
    });
  };

  const hasPendingSplit = (splits: OrderPaymentPrepareSplit[]) =>
    splits.some((it) => it.linkState === 'PENDING_ORDER_SUBMIT');

  const applyPreparedPaymentData = (data: any) => {
    const nextDecision = data?.paymentDecision as OrderPaymentDecision | undefined;
    const nextSplits = Array.isArray(data?.paymentSplits)
      ? (data.paymentSplits as OrderPaymentPrepareSplit[])
      : [];
    if (nextDecision) {
      setPaymentDecision(nextDecision);
    }
    setPaymentSplits(nextSplits);
    return { nextDecision, nextSplits };
  };

  const schedulePaymentPoll = (orderId: string, attempt = 1) => {
    clearPaymentPoll();
    if (attempt > 10 || paymentFlowStage === 'IDLE') {
      setPaymentFlowMessage('仍有拆单未准备完成，可点击“刷新支付状态”继续获取。');
      return;
    }
    paymentPollTimerRef.current = window.setTimeout(async () => {
      try {
        const data = await fetchPaymentPrepare(orderId, false);
        const { nextDecision, nextSplits } = applyPreparedPaymentData(data);
        if (nextDecision && !nextDecision.required) {
          finishBookingFlow('支付状态已同步，订单处理完成');
          return;
        }
        if (nextSplits.length === 0) {
          finishBookingFlow('支付状态已同步，订单处理完成');
          return;
        }
        if (hasPendingSplit(nextSplits)) {
          setPaymentFlowMessage(`部分拆单仍在准备支付链接，自动刷新中（${attempt}/10）...`);
          schedulePaymentPoll(orderId, attempt + 1);
        } else {
          setPaymentFlowMessage('');
        }
      } catch (err) {
        setPaymentFlowMessage(err instanceof Error ? err.message : '自动刷新支付状态失败');
      }
    }, 3000);
  };

  const preparePayments = async (orderId: string, waitForReady: boolean) => {
    setPaymentFlowStage('PREPARING');
    setPaymentFlowMessage('正在准备拆单支付信息...');
    try {
      const data = await fetchPaymentPrepare(orderId, waitForReady);
      const { nextDecision, nextSplits } = applyPreparedPaymentData(data);
      setPaymentFlowStage('LIST');
      if (nextDecision && !nextDecision.required) {
        finishBookingFlow('订单已全部支付完成');
        return;
      }
      if (nextSplits.length === 0) {
        finishBookingFlow('订单已全部支付完成');
        return;
      }
      if (hasPendingSplit(nextSplits)) {
        setPaymentFlowMessage('部分拆单仍在下单处理中，系统会自动刷新支付状态。');
        schedulePaymentPoll(orderId, 1);
      } else {
        setPaymentFlowMessage('');
      }
    } catch (err) {
      setPaymentFlowStage('LIST');
      setPaymentFlowMessage(err instanceof Error ? err.message : '准备支付信息失败');
    }
  };

  const syncPayments = async (paidItemIds: string[] = []) => {
    if (!activeOrderId) {
      return;
    }
    setIsPaymentSyncing(true);
    setPaymentFlowMessage('正在同步支付状态...');
    try {
      const syncResult = await fetchWithAuth(`/api/orders/${activeOrderId}/payment/sync`, {
        method: 'POST',
        body: JSON.stringify({ paidItemIds, refreshExecutionStatus: true })
      });
      if (syncResult?.paymentDecision) {
        setPaymentDecision(syncResult.paymentDecision as OrderPaymentDecision);
      }
      const prepareResult = await fetchPaymentPrepare(activeOrderId, false);
      const { nextDecision, nextSplits } = applyPreparedPaymentData(prepareResult);
      if ((nextDecision && !nextDecision.required) || nextSplits.length === 0) {
        finishBookingFlow('支付状态已同步，订单处理完成');
        return;
      }
      if (hasPendingSplit(nextSplits)) {
        setPaymentFlowMessage('仍有拆单处理中，正在自动刷新支付状态。');
        schedulePaymentPoll(activeOrderId, 1);
      } else {
        setPaymentFlowMessage('支付状态已更新，请继续完成剩余拆单支付。');
      }
    } catch (err) {
      setPaymentFlowMessage(err instanceof Error ? err.message : '同步支付状态失败');
    } finally {
      setIsPaymentSyncing(false);
      setPayingItemId('');
    }
  };

  const paySplitItem = async (item: OrderPaymentPrepareSplit) => {
    if (!activeOrderId) {
      return;
    }
    if (!item.paymentLink) {
      setPaymentFlowMessage('当前拆单暂无支付链接，请先刷新。');
      return;
    }

    setPayingItemId(item.itemId);
    const bridgeUrl = `/payment-bridge?payUrl=${encodeURIComponent(item.paymentLink)}`;
    const newWindow = window.open(bridgeUrl, '_blank', 'noopener,noreferrer');
    if (!newWindow) {
      setPayingItemId('');
      setPaymentFlowMessage('支付窗口被浏览器拦截，请允许弹窗后重试。');
      return;
    }

    const paid = window.confirm('新窗口已打开。若你已完成该笔支付，请点击“确定”同步状态；未完成请点“取消”。');
    if (!paid) {
      setPayingItemId('');
      return;
    }
    await syncPayments([item.itemId]);
  };

  useEffect(() => {
    return () => {
      clearPaymentPoll();
    };
  }, []);

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

  const submitBooking = async (submitNow: boolean) => {
      if (!selectedHotel || !selectedRoom || !selectedRate) {
        return;
      }
      setIsLoading(true);
      setSearchError('');
      try {
        const totalAmount = selectedRate.price * getNightCount();
        const data = await fetchWithAuth('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            submitNow,
            chainId: selectedHotel.chainId || selectedHotel.id,
            hotelName: selectedHotel.name,
            customerName: bookingForm.guestName,
            contactPhone: bookingForm.guestPhone,
            checkInDate: searchParams.checkIn,
            checkOutDate: searchParams.checkOut,
            status: submitNow ? 'PROCESSING' : 'WAIT_CONFIRM',
            paymentStatus: submitNow ? 'UNPAID' : 'UNPAID',
            remark: bookingForm.note,
            splits: [
              {
                bookingTier: selectedRate.channelKey || selectedRate.type,
                roomTypeId: selectedRate.roomTypeId || selectedRoom.id,
                rateCode: selectedRate.rateCode,
                rateCodeId: selectedRate.rateCodeId,
                rpActivityId: selectedRate.rpActivityId,
                rateCodePriceType: selectedRate.rateCodePriceType,
                rateCodeActivities: selectedRate.rateCodeActivities,
                roomType: selectedRoom.name,
                roomCount: 1,
                amount: totalAmount,
                paymentStatus: 'UNPAID',
                status: submitNow ? 'PROCESSING' : 'WAIT_CONFIRM',
                executionStatus: submitNow ? 'QUEUED' : 'PLAN_PENDING',
                checkInDate: searchParams.checkIn,
                checkOutDate: searchParams.checkOut
              }
            ]
          })
        });

        if (!submitNow) {
          finishBookingFlow('订单已暂存为虚拟下单计划（待确认）');
          return;
        }

        const decision = data?.paymentDecision as OrderPaymentDecision | undefined;
        const orderId = data?.order?.id ? String(data.order.id) : '';

        if (decision?.required && orderId) {
          setActiveOrderId(orderId);
          setPaymentDecision(decision);
          setPaymentFlowStage('DECISION');
          setPaymentFlowMessage('');
          return;
        }

        finishBookingFlow('订单已提交，进入待下单队列');
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : '提交订单失败');
      } finally {
        setIsLoading(false);
      }
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
          onSubmitNow={() => submitBooking(true)}
          onSaveDraft={() => submitBooking(false)}
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

  const renderPaymentDecisionModal = () => {
    if (paymentFlowStage !== 'DECISION' || !paymentDecision) {
      return null;
    }
    return (
      <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4">
          <h3 className="text-xl font-bold text-gray-900">订单已提交，是否立即支付？</h3>
          <p className="text-sm text-gray-600">
            当前未支付拆单 {paymentDecision.unpaidCount} 个，已可支付 {paymentDecision.readyCount} 个。
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => finishBookingFlow('订单已创建，可稍后在订单中心继续支付')}
              className="px-4 py-3 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50"
            >
              稍后支付
            </button>
            <button
              type="button"
              onClick={() => {
                if (!activeOrderId) {
                  setPaymentFlowMessage('订单号缺失，无法准备支付信息');
                  return;
                }
                preparePayments(activeOrderId, true);
              }}
              className="px-4 py-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
            >
              立即支付
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPaymentListModal = () => {
    if (paymentFlowStage !== 'PREPARING' && paymentFlowStage !== 'LIST') {
      return null;
    }
    return (
      <div className="fixed inset-0 bg-black/55 z-40 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden bg-white rounded-2xl shadow-2xl flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">拆单支付</h3>
            <button
              type="button"
              onClick={() => finishBookingFlow('订单已创建，可稍后在订单中心继续支付')}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              稍后支付
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-3">
            {paymentFlowStage === 'PREPARING' && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
                <span className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin" />
                正在准备支付信息，请稍候...
              </div>
            )}

            {paymentFlowMessage && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {paymentFlowMessage}
              </div>
            )}

            {paymentSplits.map((item) => {
              const actionDisabled = isPaymentSyncing || payingItemId === item.itemId;
              return (
                <div key={item.itemId} className="rounded-xl border border-gray-200 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">拆单 #{item.splitIndex}/{item.splitTotal} · {item.roomType}</div>
                      <div className="text-xs text-gray-500">金额: {item.amount} · 状态: {item.paymentStatus} · 执行: {item.executionStatus}</div>
                    </div>
                    <div className="text-xs px-2 py-1 rounded border bg-gray-50 text-gray-700 border-gray-200">
                      {item.linkState}
                    </div>
                  </div>

                  {item.error && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
                      {item.error}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {item.linkState === 'READY' && item.paymentLink && (
                      <button
                        type="button"
                        disabled={actionDisabled}
                        onClick={() => paySplitItem(item)}
                        className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {payingItemId === item.itemId ? '处理中...' : '去支付'}
                      </button>
                    )}

                    {item.linkState === 'LINK_FAILED' && (
                      <button
                        type="button"
                        disabled={actionDisabled || !activeOrderId}
                        onClick={() => {
                          if (activeOrderId) {
                            preparePayments(activeOrderId, false);
                          }
                        }}
                        className="px-3 py-1.5 rounded border border-orange-300 text-orange-700 text-xs bg-orange-50 disabled:opacity-50"
                      >
                        重试链接
                      </button>
                    )}

                    {item.linkState === 'PENDING_ORDER_SUBMIT' && (
                      <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                        <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                        等待拆单下单完成
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {paymentFlowStage === 'LIST' && paymentSplits.length === 0 && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                当前暂无待支付拆单。
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={isPaymentSyncing || !activeOrderId}
              onClick={() => {
                if (activeOrderId) {
                  preparePayments(activeOrderId, false);
                }
              }}
              className="px-3 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              刷新支付状态
            </button>
            <button
              type="button"
              disabled={isPaymentSyncing || !activeOrderId}
              onClick={() => syncPayments([])}
              className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {isPaymentSyncing ? '同步中...' : '我已完成支付，立即同步'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Success Overlay
  if (success) {
      return (
          <div className="h-full flex items-center justify-center bg-gray-50">
              <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                      ✓
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">预订成功</h2>
                  <p className="text-gray-500 mb-6">{successMessage || '订单处理成功'}</p>
              </div>
          </div>
      )
  }

  // Router Logic
  const pageContent = (() => {
    switch(step) {
      case 'SEARCH': return renderSearch();
      case 'DETAIL': return renderHotelDetail();
      case 'CONFIRM': return renderBookingForm();
      default: return renderSearch();
    }
  })();

  return (
    <>
      {pageContent}
      {renderPaymentDecisionModal()}
      {renderPaymentListModal()}
    </>
  );
};
