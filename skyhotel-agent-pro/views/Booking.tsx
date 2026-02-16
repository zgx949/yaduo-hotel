
import React, { useState, useMemo, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { DateRangePicker } from '../components/DateRangePicker';
import { BookingType, Hotel, RatePlan, Room } from '../types';
import { MOCK_HOTELS, POPULAR_CITIES, VALUE_ADDED_SERVICES } from '../constants';

type BookingStep = 'SEARCH' | 'LIST' | 'DETAIL' | 'CONFIRM';

export const Booking: React.FC = () => {
  const [step, setStep] = useState<BookingStep>('SEARCH');
  const [showCitySelector, setShowCitySelector] = useState(false);
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
    city: '上海市',
    checkIn: new Date().toISOString().split('T')[0],
    checkOut: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    keyword: ''
  });

  const [bookingForm, setBookingForm] = useState({
    guestName: '刘心怡', // Mock default user
    guestPhone: '183****2063',
    note: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // New state for Benefits in Confirm View
  const [selectedBenefits, setSelectedBenefits] = useState({
    breakfast: 1, 
    upgrade: 0,
    lateCheckout: 0,
    slippers: 1
  });
  const [appliedCoupon, setAppliedCoupon] = useState<{name: string, value: number} | null>(null);
  const [invoiceEnabled, setInvoiceEnabled] = useState(false);

  // Filter Hotels logic
  const filteredHotels = useMemo(() => {
    return MOCK_HOTELS.filter(hotel => {
        const matchCity = hotel.location.includes(searchParams.city.replace('市', '')); // basic matching
        const matchKeyword = !searchParams.keyword || 
             hotel.name.includes(searchParams.keyword) || 
             hotel.location.includes(searchParams.keyword) || 
             hotel.tags.some(t => t.includes(searchParams.keyword));
        
        return matchCity && matchKeyword;
    });
  }, [searchParams.city, searchParams.keyword]);

  const handleDateConfirm = (start: string, end: string) => {
    setSearchParams(prev => ({ ...prev, checkIn: start, checkOut: end }));
    
    // Simulate API Load for new prices
    setIsRatesLoading(true);
    setExpandedRoomIds(new Set()); // Collapse all rooms on date change
    setTimeout(() => {
        setIsRatesLoading(false);
    }, 1000); // 1.0s simulated loading time
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

  // --- Views ---

  // City Selector Modal
  const renderCitySelector = () => {
      if (!showCitySelector) return null;
      return (
        <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col animate-fadeIn">
            <div className="bg-white p-4 flex items-center gap-3 border-b border-gray-100 shadow-sm">
                <button onClick={() => setShowCitySelector(false)} className="p-1">
                    <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <div className="flex-1 bg-gray-100 rounded-lg flex items-center px-3 py-2">
                    <span className="text-gray-400 mr-2">🔍</span>
                    <input 
                        autoFocus
                        type="text" 
                        placeholder="输入城市名或拼音" 
                        className="bg-transparent outline-none w-full text-sm"
                    />
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-6">
                    <h3 className="text-xs font-bold text-gray-400 mb-3">当前定位</h3>
                    <div className="flex gap-3">
                        <button className="flex items-center gap-1 px-4 py-2 bg-white rounded-lg border border-gray-200 text-sm font-medium text-blue-600 shadow-sm">
                            📍 {searchParams.city}
                        </button>
                    </div>
                </div>

                <div className="mb-6">
                    <h3 className="text-xs font-bold text-gray-400 mb-3">热门城市</h3>
                    <div className="grid grid-cols-4 gap-3">
                        {POPULAR_CITIES.map(city => (
                            <button 
                                key={city}
                                onClick={() => {
                                    setSearchParams({...searchParams, city});
                                    setShowCitySelector(false);
                                }}
                                className={`py-2 rounded-lg text-sm font-medium border ${
                                    searchParams.city === city 
                                        ? 'bg-blue-50 border-blue-500 text-blue-700' 
                                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                {city}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      );
  };

  // 1. Search Landing Page
  const renderSearch = () => (
    <div className="h-full flex flex-col items-center relative">
      {renderCitySelector()}
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
              {/* City Row */}
              <div 
                className="flex items-center justify-between border-b border-gray-100 pb-4 cursor-pointer"
                onClick={() => setShowCitySelector(true)}
              >
                  <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-gray-900">{searchParams.city}</span>
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
              </div>

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
              <div className="flex flex-col gap-2">
                  <input 
                    type="text" 
                    placeholder="搜索城市/地标/酒店" 
                    className="w-full text-lg font-medium placeholder-gray-300 outline-none"
                    value={searchParams.keyword}
                    onChange={e => setSearchParams({...searchParams, keyword: e.target.value})}
                    onKeyDown={e => {
                        if (e.key === 'Enter') setStep('LIST');
                    }}
                  />

              </div>

              {/* Action Button */}
              <button 
                onClick={() => setStep('LIST')}
                className="w-full bg-slate-800 text-amber-50 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-slate-700 transition-colors"
              >
                  立即预订
              </button>
          </div>
      </div>
    </div>
  );

  // 2. Hotel List
  const renderHotelList = () => (
    <div className="space-y-4 h-full flex flex-col">
        {renderCitySelector()}
        <DateRangePicker 
            isOpen={showDatePicker}
            onClose={() => setShowDatePicker(false)}
            onConfirm={handleDateConfirm}
            initialStartDate={searchParams.checkIn}
            initialEndDate={searchParams.checkOut}
        />
        
        {/* Header */}
        <div className="sticky top-0 bg-gray-50 z-20 pb-2">
            <div className="flex items-center gap-4 bg-white p-3 rounded-xl shadow-sm border border-gray-200">
                <button onClick={() => setStep('SEARCH')} className="p-1">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="flex-1 flex flex-col justify-center">
                    <div 
                        className="text-sm font-bold text-gray-900 flex items-center gap-1 cursor-pointer" 
                        onClick={() => setShowCitySelector(true)}
                    >
                        {searchParams.city} 
                        {searchParams.keyword && <span className="font-normal text-gray-500">| {searchParams.keyword}</span>}
                    </div>
                    <div 
                        className="text-xs text-gray-500 cursor-pointer"
                        onClick={() => setShowDatePicker(true)}
                    >
                        {getDisplayDate(searchParams.checkIn)} - {getDisplayDate(searchParams.checkOut)}
                    </div>
                </div>
                <button className="text-gray-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>
            </div>
            
        </div>

        {/* List */}
        <div className="flex-1 space-y-4 pb-20 overflow-y-auto">
            {filteredHotels.length === 0 ? (
                 <div className="flex flex-col items-center justify-center pt-20 text-gray-400">
                     <span className="text-4xl mb-2">🤔</span>
                     <p>未找到符合条件的酒店</p>
                     <button 
                        onClick={() => setSearchParams({...searchParams, keyword: '', city: '上海市'})}
                        className="mt-4 text-blue-600 text-sm"
                    >
                        清除筛选
                     </button>
                 </div>
            ) : (
                filteredHotels.map(hotel => (
                <div 
                    key={hotel.id} 
                    onClick={() => { setSelectedHotel(hotel); setStep('DETAIL'); }}
                    className="bg-white rounded-2xl overflow-hidden shadow-sm flex flex-col cursor-pointer hover:shadow-md transition-shadow"
                >
                    <div className="relative h-40 w-full">
                        <img src={hotel.image} alt={hotel.name} className="w-full h-full object-cover" />
                        <div className="absolute top-2 left-2">
                            <span className="bg-slate-800 text-amber-100 text-[10px] px-2 py-1 rounded-r-full font-bold">亚朵 S</span>
                        </div>
                        {hotel.blacklistCount && hotel.blacklistCount > 0 && (
                            <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] px-2 py-1 rounded font-bold flex items-center gap-1 shadow-lg animate-pulse">
                                ⚠️ {hotel.blacklistCount}人拉黑
                            </div>
                        )}
                        {!hotel.blacklistCount && (
                             <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded backdrop-blur-sm">
                                热门打卡
                            </div>
                        )}
                    </div>
                    <div className="p-4 space-y-2">
                        <h3 className="font-bold text-lg text-gray-900 leading-tight">{hotel.name}</h3>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="font-bold text-green-700 text-sm">★ {hotel.score}</span>
                            <span className="text-gray-500 underline">{hotel.reviews} 点评</span>
                            <span className="text-gray-400">|</span>
                            <span className="text-gray-600">安</span>
                        </div>
                        <p className="text-xs text-gray-500">{hotel.location} · 距市中心直线800米</p>
                        
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {hotel.tags.slice(0, 4).map(tag => (
                                <span key={tag} className="px-1.5 py-0.5 bg-gray-50 text-gray-500 text-[10px] rounded border border-gray-100">
                                    {tag}
                                </span>
                            ))}
                        </div>

                        <div className="flex justify-end items-baseline gap-1 mt-2">
                            <span className="text-xs text-gray-400 line-through">¥{Math.floor(hotel.minPrice * 1.2)}</span>
                            <span className="text-xs text-red-500">¥</span>
                            <span className="text-xl font-bold text-red-500">{hotel.minPrice}</span>
                            <span className="text-xs text-gray-400">起</span>
                        </div>
                    </div>
                </div>
            )))}
        </div>
    </div>
  );

  // 3. Hotel Detail
  const renderHotelDetail = () => {
    if (!selectedHotel) return null;

    const toggleRoom = (roomId: string) => {
        const newSet = new Set(expandedRoomIds);
        if (newSet.has(roomId)) newSet.delete(roomId);
        else newSet.add(roomId);
        setExpandedRoomIds(newSet);
    };

    return (
        <div className="bg-gray-50 min-h-full pb-20 relative">
            <DateRangePicker 
                isOpen={showDatePicker}
                onClose={() => setShowDatePicker(false)}
                onConfirm={handleDateConfirm}
                initialStartDate={searchParams.checkIn}
                initialEndDate={searchParams.checkOut}
            />

            {/* Toast for Copy */}
            {copyMessage && (
                <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm z-50 animate-fadeIn flex items-center gap-2">
                    <span className="text-green-400">✓</span> {copyMessage}
                </div>
            )}

            {/* Nav */}
            <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md px-4 py-3 flex justify-between items-center border-b border-gray-100">
                <button onClick={() => setStep('LIST')} className="p-1 -ml-1">
                    <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h1 className="font-bold text-gray-900 truncate max-w-[200px]">{selectedHotel.name}</h1>
            </div>
            
            {/* Blacklist Warning in Detail */}
            {selectedHotel.blacklistCount && selectedHotel.blacklistCount > 0 && (
                <div className="bg-red-50 p-3 flex items-center gap-3 border-b border-red-100">
                    <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0 text-lg">⚠️</div>
                    <div className="flex-1">
                        <p className="text-xs font-bold text-red-800">避雷警报：{selectedHotel.blacklistCount} 位代理已拉黑此酒店</p>
                        <p className="text-[10px] text-red-600">存在售后风险，建议谨慎预订。</p>
                    </div>
                </div>
            )}

            {/* Hotel Info Block */}
            <div className="bg-white p-4 pb-6 relative">
                <div className="flex justify-between items-start mb-4">
                   <div className="flex-1 pr-2">
                        <div className="flex flex-wrap gap-2 mb-2 text-xs text-gray-500">
                            <span>2024年10月开业</span>
                            <span>外宾适用</span>
                            <span>热门打卡</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                             <span className="font-bold text-xl text-green-700">★ {selectedHotel.score}</span>
                             <span className="text-sm underline text-gray-500">{selectedHotel.reviews}条 ></span>
                        </div>
                        <div className="text-sm text-gray-800 leading-relaxed pr-8 relative">
                            {selectedHotel.address}
                        </div>
                   </div>
                   {/* Generate Whole Hotel Quote Button */}
                   <button 
                       onClick={() => handleCopyText(generateHotelQuote(selectedHotel), '整店文案已复制')}
                       className="flex flex-col items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-600 p-2 rounded-lg transition-colors border border-blue-100 active:scale-95"
                       title="复制整店报价文案"
                   >
                       <span className="text-xl mb-1">📋</span>
                       <span className="text-[10px] font-bold">整店报价</span>
                   </button>
                </div>

                {/* Date Picker Row with Interaction */}
                <div 
                    className="flex items-center justify-between bg-gray-50 rounded-lg p-3 relative cursor-pointer active:scale-95 transition-transform"
                    onClick={() => setShowDatePicker(true)}
                >
                    {/* Check In */}
                    <div>
                        <div className="pointer-events-none">
                            <span className="font-bold text-gray-900">{getDisplayDate(searchParams.checkIn)}</span>
                            <span className="text-xs text-gray-500 ml-1">入住</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-center">
                        <span className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600">
                            {getNightCount()}晚
                        </span>
                        <span className="text-[10px] text-blue-500 mt-0.5 scale-90 opacity-80">点击修改</span>
                    </div>

                    {/* Check Out */}
                    <div>
                        <div className="text-right pointer-events-none">
                            <span className="font-bold text-gray-900">{getDisplayDate(searchParams.checkOut)}</span>
                            <span className="text-xs text-gray-500 ml-1">离店</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Room List with Loading State */}
            {isRatesLoading ? (
                <div className="mt-2 space-y-3 px-3">
                    <div className="flex justify-center py-2 text-xs text-gray-400 flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        正在实时查询价格...
                    </div>
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm p-3 animate-pulse">
                            <div className="flex gap-3 h-24">
                                <div className="w-24 h-24 bg-gray-200 rounded-lg flex-shrink-0"></div>
                                <div className="flex-1 py-1 space-y-2">
                                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                                    <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                                    <div className="h-6 bg-gray-200 rounded w-full mt-4"></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="mt-2 space-y-3 px-3 animate-fadeIn">
                    {selectedHotel.rooms.map(room => {
                        const minRate = Math.min(...room.rates.map(r => r.price));
                        const isExpanded = expandedRoomIds.has(room.id);

                        return (
                            <div key={room.id} className="bg-white rounded-xl overflow-hidden shadow-sm">
                                {/* Room Header - Click to Toggle */}
                                <div className="flex p-3 gap-3 cursor-pointer" onClick={() => toggleRoom(room.id)}>
                                    <div className="relative w-24 h-24 flex-shrink-0">
                                        <img src={room.image} className="w-full h-full object-cover rounded-lg" alt={room.name} />
                                        <div className="absolute top-0 left-0 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded-tl-lg rounded-br-lg">
                                            房量紧张
                                        </div>
                                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1 rounded">
                                            {room.rates.length}
                                        </div>
                                    </div>
                                    <div className="flex-1 py-1 flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start">
                                                <h3 className="font-bold text-lg text-gray-900">{room.name}</h3>
                                                <button className={`text-gray-400 transition-transform ${isExpanded ? '-rotate-90' : 'rotate-90'}`}>›</button>
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {room.size} | {room.bed} | {room.window}
                                            </div>
                                        </div>
                                        
                                        <div className="flex justify-between items-end mt-2">
                                            <div className="flex flex-wrap gap-1">
                                                {room.tags.slice(0, 2).map(tag => (
                                                    <span key={tag} className="px-1.5 py-0.5 bg-gray-50 text-gray-500 text-[10px] rounded">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-xs text-amber-600 font-bold">¥</span>
                                                    <span className="text-xl text-amber-600 font-bold">{minRate}</span>
                                                    <span className="text-xs text-gray-400">起</span>
                                                </div>
                                                {/* Marketing Tip */}
                                                <span className="text-[10px] text-red-500 bg-red-50 px-1 rounded mt-0.5">
                                                    下单可再优惠¥30
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Rates List (Collapsible) */}
                                {isExpanded && (
                                    <div className="bg-gray-50/50 border-t border-gray-100 animate-fadeIn">
                                        {room.rates
                                        .sort((a, b) => a.price - b.price) // Sort by price asc
                                        .map(rate => (
                                            <div key={rate.id} className="p-3 border-b border-gray-100 last:border-0 flex justify-between items-center hover:bg-gray-50 transition-colors">
                                                <div className="flex-1 pr-2">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-bold text-sm text-gray-800">{rate.name}</h4>
                                                        {rate.type === BookingType.PLATINUM && <span className="text-[10px] bg-slate-800 text-amber-200 px-1 rounded">白金卡</span>}
                                                        {rate.type === BookingType.CORPORATE && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">企</span>}
                                                    </div>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {rate.tags.map(tag => (
                                                            <span key={tag} className="text-[10px] text-amber-600 border border-amber-100 px-1 rounded bg-white">
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    {rate.type === BookingType.PLATINUM && (
                                                        <p className="text-[10px] text-gray-400 mt-1">本人入住最高可得645消费积分</p>
                                                    )}
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="flex items-baseline gap-1">
                                                        {rate.originalPrice && (
                                                            <span className="text-xs text-gray-300 line-through">¥{rate.originalPrice}</span>
                                                        )}
                                                        <span className="text-xs text-amber-600 font-bold">¥</span>
                                                        <span className="text-xl text-amber-600 font-bold">{rate.price}</span>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-1">
                                                        {/* Single Quote Button */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCopyText(generateSingleQuote(selectedHotel, room, rate), '单品报价已复制');
                                                            }}
                                                            className="px-2 py-1.5 bg-gray-100 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-gray-200"
                                                            title="复制此报价"
                                                        >
                                                            📋
                                                        </button>

                                                        <button 
                                                            onClick={() => {
                                                                setSelectedRoom(room);
                                                                setSelectedRate(rate);
                                                                setStep('CONFIRM');
                                                            }}
                                                            className={`px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm transition-transform active:scale-95 ${
                                                                rate.type === BookingType.PLATINUM ? 'bg-amber-500 text-white' : 'bg-amber-500 text-white'
                                                            }`}
                                                        >
                                                            订
                                                        </button>
                                                    </div>
                                                    
                                                    {rate.tags.some(t => t.includes('立减') || t.includes('优惠')) && (
                                                        <span className="text-[10px] text-red-500">已优惠¥30</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
  };

  // 4. Booking Form (Simplified Checkout)
  const renderBookingForm = () => {
    if (!selectedHotel || !selectedRoom || !selectedRate) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Simulate API call
        setTimeout(() => {
            setIsLoading(false);
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setStep('SEARCH'); // Reset
                setExpandedRoomIds(new Set()); // Reset Expanded
            }, 2000);
        }, 1500);
    };

    const nightCount = getNightCount();
    const totalPrice = (selectedRate.price * nightCount) - (appliedCoupon?.value || 0);

    const updateBenefit = (type: keyof typeof selectedBenefits, delta: number) => {
        const current = selectedBenefits[type];
        const max = type === 'breakfast' ? 2 : type === 'slippers' ? 3 : type === 'upgrade' ? 1 : 2; // mock max limits
        const next = Math.max(0, Math.min(max, current + delta));
        setSelectedBenefits({ ...selectedBenefits, [type]: next });
    };

    return (
        <div className="bg-gray-50 min-h-full flex flex-col pb-32">
             {/* Nav */}
             <div className="bg-white/95 backdrop-blur-sm sticky top-0 z-30 px-4 py-3 flex items-center gap-2 shadow-sm">
                <button onClick={() => setStep('DETAIL')} className="p-1 -ml-2 text-gray-800">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h1 className="font-bold text-lg text-gray-900 truncate">{selectedHotel.name}</h1>
             </div>

             <div className="p-4 space-y-4">
                 {/* Room Header */}
                 <div className="bg-white rounded-xl p-4 shadow-sm">
                     <div className="flex justify-between items-start mb-2">
                        <h2 className="text-xl font-bold text-gray-900">{selectedRoom.name}</h2>
                        <button className="text-xs text-gray-400 flex items-center">
                            房型详情 <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                     </div>
                     <p className="text-xs text-gray-500 mb-4">
                        {selectedRoom.size} | {selectedRoom.bed} | {selectedRoom.window} | 无早餐
                     </p>
                     
                     <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                         <div className="flex items-baseline gap-2">
                             <span className="font-bold text-lg text-gray-900">{getDisplayDate(searchParams.checkIn)}</span>
                             <span className="text-xs text-gray-500">今天</span>
                         </div>
                         <div className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">{nightCount} 晚</div>
                         <div className="flex items-baseline gap-2 justify-end">
                             <span className="font-bold text-lg text-gray-900">{getDisplayDate(searchParams.checkOut)}</span>
                             <span className="text-xs text-gray-500">明天</span>
                         </div>
                     </div>
                     <p className="text-xs text-orange-400 mt-2">预订后不可取消及退款 ></p>
                 </div>

                 {/* Guest Info */}
                 <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
                     <h3 className="font-bold text-base text-gray-900">入住信息</h3>
                     <div className="flex justify-between items-center py-2 border-b border-gray-50">
                        <label className="text-sm text-gray-600 w-20">入住人<span className="text-red-500">*</span></label>
                        <input 
                            type="text" 
                            className="flex-1 outline-none text-right font-medium text-gray-900"
                            value={bookingForm.guestName}
                            onChange={e => setBookingForm({...bookingForm, guestName: e.target.value})}
                        />
                        <button className="ml-2 text-gray-400">
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        </button>
                     </div>
                     <div className="flex justify-between items-center py-2">
                        <label className="text-sm text-gray-600 w-20">联系电话<span className="text-red-500">*</span></label>
                        <input 
                            type="tel" 
                            className="flex-1 outline-none text-right font-medium text-gray-900"
                            value={bookingForm.guestPhone}
                            onChange={e => setBookingForm({...bookingForm, guestPhone: e.target.value})}
                        />
                     </div>
                 </div>

                 {/* Benefits Card */}
                 <div className="rounded-xl overflow-hidden shadow-sm bg-white">
                    <div className="bg-gradient-to-r from-slate-200 to-slate-100 p-3 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                            <span className="text-amber-600">♛</span> 铂金会员专享
                        </h3>
                        <span className="text-[10px] text-gray-500">也可在行程助手选择</span>
                    </div>
                    
                    <div className="p-4">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-sm font-bold text-gray-900">会员礼遇 <span className="text-xs font-normal text-gray-500">(已享2项 值¥124)</span></span>
                            <span className="text-gray-400">›</span>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2">
                            {[
                                { key: 'breakfast', label: '双人早餐券', total: 2 },
                                { key: 'upgrade', label: '升级房型券', total: 1, tag: '视房态安排' },
                                { key: 'lateCheckout', label: '延时退房券', total: 2 },
                                { key: 'slippers', label: '专属拖鞋', total: 3 },
                            ].map(benefit => (
                                <div key={benefit.key} className="bg-orange-50/50 rounded-lg p-2 flex flex-col items-center justify-between h-28 relative">
                                    {benefit.tag && <span className="absolute -top-1.5 bg-amber-200 text-amber-800 text-[8px] px-1 rounded">{benefit.tag}</span>}
                                    <div className="text-center mt-2">
                                        <div className="text-xs font-bold text-gray-800 leading-tight mb-1">{benefit.label}</div>
                                        <div className="text-[10px] text-gray-500">可用 {benefit.total} 张</div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <button 
                                            onClick={() => updateBenefit(benefit.key as any, -1)}
                                            className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs ${
                                                selectedBenefits[benefit.key as keyof typeof selectedBenefits] > 0 ? 'border-amber-500 text-amber-500 bg-white' : 'border-gray-200 text-gray-300'
                                            }`}
                                        >-</button>
                                        <span className="text-sm font-bold w-3 text-center">{selectedBenefits[benefit.key as keyof typeof selectedBenefits]}</span>
                                        <button 
                                            onClick={() => updateBenefit(benefit.key as any, 1)}
                                            className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs ${
                                                selectedBenefits[benefit.key as keyof typeof selectedBenefits] < benefit.total ? 'border-amber-500 text-amber-500 bg-white' : 'border-gray-200 text-gray-300'
                                            }`}
                                        >+</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="text-[10px] text-gray-400 mt-4 flex items-center gap-1">
                            <span>免费夜宵, 离店返约¥22券, 离店得约635消费积分</span>
                            <span className="w-3 h-3 rounded-full bg-gray-200 text-white flex items-center justify-center text-[8px]">?</span>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 p-4">
                        <div className="flex justify-between items-center mb-3">
                             <h4 className="text-sm font-bold text-gray-900">亚朵锦囊增值服务 <span className="text-xs font-normal text-gray-500">(3份免费)</span></h4>
                             <span className="text-gray-400">›</span>
                        </div>
                        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                            {VALUE_ADDED_SERVICES.map(service => (
                                <div key={service.id} className="flex-shrink-0 w-20 flex flex-col items-center gap-1">
                                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 relative">
                                        <img src={service.image} className="w-full h-full object-cover opacity-80" alt={service.name} />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white font-bold text-xs p-1 text-center">
                                            {service.name}
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-gray-500">{service.desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                 </div>

                 {/* Coupon & Invoice */}
                 <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
                     <h3 className="font-bold text-base text-gray-900 mb-2">订单优惠</h3>
                     
                     <div className="flex justify-between items-center">
                         <span className="text-sm text-gray-600">优惠/免房</span>
                         <div className="flex items-center gap-1 cursor-pointer">
                             {appliedCoupon ? (
                                 <span className="text-sm text-red-500 font-medium">已选1张 -¥{appliedCoupon.value}</span>
                             ) : (
                                 <span className="text-sm text-gray-400">无可用优惠券</span>
                             )}
                             <span className="text-gray-400">›</span>
                         </div>
                     </div>

                     <div className="flex justify-between items-center opacity-50">
                         <span className="text-sm text-gray-600">积分抵现</span>
                         <div className="flex items-center gap-1">
                             <span className="text-sm text-gray-400">积分不足100, 不支持使用</span>
                             <div className="w-4 h-4 rounded-full border border-gray-300"></div>
                         </div>
                     </div>

                     <div className="border-t border-gray-50 my-2"></div>
                     
                     <div className="flex justify-between items-center">
                         <div className="flex items-center gap-1">
                             <span className="text-sm text-gray-600">开发票</span>
                             <span className="w-3 h-3 rounded-full bg-gray-200 text-white flex items-center justify-center text-[8px]">?</span>
                         </div>
                         <div 
                            onClick={() => setInvoiceEnabled(!invoiceEnabled)}
                            className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${invoiceEnabled ? 'bg-green-500' : 'bg-gray-200'}`}
                         >
                             <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${invoiceEnabled ? 'translate-x-4' : ''}`}></div>
                         </div>
                     </div>
                 </div>
                 
                 {/* Footer Links */}
                 <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
                     <div className="flex justify-between items-center">
                         <span className="text-sm text-gray-600">预计到店</span>
                         <div className="flex items-center gap-1 text-gray-400 text-sm">
                             预计到店时间 <span className="text-gray-400">›</span>
                         </div>
                     </div>
                     <div className="flex justify-between items-start">
                         <span className="text-sm text-gray-600">备选要求</span>
                         <span className="text-sm text-gray-900 text-right w-2/3 truncate">每晚2份、无烟房、需要安静风景好的... ›</span>
                     </div>
                 </div>

                 {/* Warning Text */}
                 <div className="flex items-center gap-1 text-xs text-orange-800 bg-orange-50 p-2 rounded-lg">
                     <span className="bg-orange-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">!</span>
                     房量紧张 当前房量仅剩1间
                 </div>
             </div>

             {/* Footer Action */}
             <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-bottom p-4 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                 <div className="max-w-7xl mx-auto flex justify-between items-center">
                     <div className="flex flex-col">
                         <div className="flex items-baseline gap-1">
                             <span className="text-sm font-bold text-amber-600">¥</span>
                             <span className="text-3xl font-bold text-amber-600">{totalPrice}</span>
                             <span className="text-xs text-gray-500 ml-1">铂金立付立减价</span>
                         </div>
                         <div className="text-xs text-gray-400">
                             已优惠 ¥{(selectedRate.originalPrice ? (selectedRate.originalPrice - selectedRate.price) : 0) + (appliedCoupon?.value || 0)} <span className="underline">账单明细</span>
                         </div>
                     </div>
                     <button 
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="bg-[#1d3c34] text-white px-10 py-3 rounded-lg font-bold text-lg shadow-lg hover:bg-[#152e28] active:scale-95 transition-all flex items-center gap-2"
                     >
                         {isLoading ? '提交中...' : `立即支付`}
                     </button>
                 </div>
             </div>
        </div>
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
      case 'LIST': return renderHotelList();
      case 'DETAIL': return renderHotelDetail();
      case 'CONFIRM': return renderBookingForm();
      default: return renderSearch();
  }
};
