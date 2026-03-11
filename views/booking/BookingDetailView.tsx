import React from 'react';
import { DateRangePicker } from '../../components/DateRangePicker';
import { BookingType, Hotel, RatePlan, Room } from '../../types';

interface BookingDetailViewProps {
  selectedHotel: Hotel;
  checkIn: string;
  checkOut: string;
  showDatePicker: boolean;
  onCloseDatePicker: () => void;
  onDateConfirm: (start: string, end: string) => void;
  copyMessage: string | null;
  onBack: () => void;
  onCopyHotelQuote: () => void;
  onAddBlacklist: () => void;
  onOpenDatePicker: () => void;
  getDisplayDate: (dateStr: string) => string;
  getNightCount: () => number;
  isRatesLoading: boolean;
  expandedRoomIds: Set<string>;
  onToggleRoom: (roomId: string) => void;
  onCopyRateQuote: (room: Room, rate: RatePlan) => void;
  onSelectRate: (room: Room, rate: RatePlan) => void;
  errorMessage?: string;
}

export const BookingDetailView: React.FC<BookingDetailViewProps> = ({
  selectedHotel,
  checkIn,
  checkOut,
  showDatePicker,
  onCloseDatePicker,
  onDateConfirm,
  copyMessage,
  onBack,
  onCopyHotelQuote,
  onAddBlacklist,
  onOpenDatePicker,
  getDisplayDate,
  getNightCount,
  isRatesLoading,
  expandedRoomIds,
  onToggleRoom,
  onCopyRateQuote,
  onSelectRate,
  errorMessage
}) => {
  return (
    <div className="bg-gray-50 min-h-full pb-20 relative">
      <DateRangePicker
        isOpen={showDatePicker}
        onClose={onCloseDatePicker}
        onConfirm={onDateConfirm}
        initialStartDate={checkIn}
        initialEndDate={checkOut}
      />

      {copyMessage && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-sm z-50 animate-fadeIn flex items-center gap-2">
          <span className="text-green-400">✓</span> {copyMessage}
        </div>
      )}

      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md px-4 py-3 border-b border-gray-100 relative">
        <button onClick={onBack} className="p-1 -ml-1 absolute left-3 top-1/2 -translate-y-1/2">
          <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="font-bold text-gray-900 text-center text-sm leading-tight px-12">{selectedHotel.name}</h1>
      </div>

      {selectedHotel.blacklistCount && selectedHotel.blacklistCount > 0 && (
        <div className="bg-red-50 p-3 flex items-center gap-3 border-b border-red-100">
          <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0 text-lg">⚠️</div>
          <div className="flex-1">
            <p className="text-xs font-bold text-red-800">避雷警报：{selectedHotel.blacklistCount} 位代理已拉黑此酒店</p>
            <p className="text-[10px] text-red-600">存在售后风险，建议谨慎预订。{selectedHotel.blacklistSummary?.latestReason ? `近期原因：${selectedHotel.blacklistSummary.latestReason}` : ''}</p>
          </div>
          <button
            type="button"
            onClick={onAddBlacklist}
            className="px-2 py-1 text-[10px] rounded border border-red-200 bg-white text-red-700 hover:bg-red-100"
          >
            去拉黑
          </button>
        </div>
      )}

      {selectedHotel.newUserPopupStatus === 'ALERT' && (
        <div className="bg-red-600 p-3 flex items-center gap-3 border-b border-red-700">
          <div className="w-8 h-8 rounded-full bg-white text-red-600 flex items-center justify-center flex-shrink-0 text-lg">!</div>
          <div className="flex-1">
            <p className="text-xs font-bold text-white">新客弹窗告警</p>
            <p className="text-[11px] text-red-100">{selectedHotel.newUserPopupMessage || '该酒店新用户下单可能触发弹窗，请谨慎下单。'}</p>
          </div>
        </div>
      )}

      {selectedHotel.newUserPopupStatus === 'UNKNOWN' && (
        <div className="bg-amber-50 p-3 flex items-center gap-3 border-b border-amber-200">
          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 text-lg">!</div>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-900">新客弹窗检测未完成</p>
            <p className="text-[11px] text-amber-700">{selectedHotel.newUserPopupMessage || '新客弹窗检测失败，建议谨慎选择新客渠道。'}</p>
          </div>
        </div>
      )}

      <div className="bg-white p-4 pb-6 relative">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 pr-2">
            <div className="flex flex-wrap gap-2 mb-2 text-xs text-gray-500">
              {(selectedHotel.tags.length > 0 ? selectedHotel.tags : ['酒店详情']).slice(0, 4).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold text-xl text-green-700">★ {selectedHotel.score}</span>
              <span className="text-sm underline text-gray-500">{selectedHotel.reviews}条 {">"}</span>
            </div>
            <div className="text-sm text-gray-800 leading-relaxed pr-8 relative">{selectedHotel.address}</div>
          </div>
          <button
            onClick={onCopyHotelQuote}
            className="flex flex-col items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-600 p-2 rounded-lg transition-colors border border-blue-100 active:scale-95"
            title="复制整店报价文案"
          >
            <span className="text-xl mb-1">📋</span>
            <span className="text-[10px] font-bold">整店报价</span>
          </button>
          <button
            onClick={onAddBlacklist}
            className="flex flex-col items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-lg transition-colors border border-red-100 active:scale-95"
            title="拉黑该酒店"
          >
            <span className="text-xl mb-1">🚫</span>
            <span className="text-[10px] font-bold">拉黑酒店</span>
          </button>
        </div>

        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 relative cursor-pointer active:scale-95 transition-transform" onClick={onOpenDatePicker}>
          <div>
            <div className="pointer-events-none">
              <span className="font-bold text-gray-900">{getDisplayDate(checkIn)}</span>
              <span className="text-xs text-gray-500 ml-1">入住</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <span className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600">{getNightCount()}晚</span>
            <span className="text-[10px] text-blue-500 mt-0.5 scale-90 opacity-80">点击修改</span>
          </div>
          <div>
            <div className="text-right pointer-events-none">
              <span className="font-bold text-gray-900">{getDisplayDate(checkOut)}</span>
              <span className="text-xs text-gray-500 ml-1">离店</span>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {errorMessage}
          </div>
        )}
      </div>

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
            const roomStock = room.stock ?? room.rates.reduce((acc, rate) => Math.max(acc, rate.stock || 0), 0);
            const isLowStock = roomStock > 0 && roomStock <= 3;
            const roomTags = Array.from(
              new Set([
                ...room.tags,
                ...room.rates.flatMap((rate) => rate.tags || [])
              ].filter(Boolean))
            );
            const minRatePlan = room.rates.reduce((min, cur) => (cur.price < min.price ? cur : min), room.rates[0]);
            const roomDiscountHint = minRatePlan?.discountTexts?.[0];

            return (
              <div key={room.id} className="bg-white rounded-xl overflow-hidden shadow-sm">
                <div className="flex p-3 gap-3 cursor-pointer" onClick={() => onToggleRoom(room.id)}>
                  <div className="relative w-24 h-24 flex-shrink-0">
                    <img src={room.image} className="w-full h-full object-cover rounded-lg" alt={room.name} />
                    {roomStock > 0 && (
                      <div className={`absolute top-0 left-0 text-[10px] px-1 py-0.5 rounded-tl-lg rounded-br-lg ${
                        isLowStock ? 'bg-red-600/90 text-white' : 'bg-emerald-600/90 text-white'
                      }`}>
                        {isLowStock ? `余${roomStock}间` : `可订${roomStock}间`}
                      </div>
                    )}
                    {roomStock === 0 && (
                      <div className="absolute top-0 left-0 text-[10px] px-1 py-0.5 rounded-tl-lg rounded-br-lg bg-gray-700/90 text-white">
                        满房
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1 rounded">{room.rates.length}</div>
                  </div>
                  <div className="flex-1 py-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <h3 className="font-bold text-lg text-gray-900">{room.name}</h3>
                        <button className={`text-gray-400 transition-transform ${isExpanded ? '-rotate-90' : 'rotate-90'}`}>›</button>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{room.size} | {room.bed} | {room.window}</div>
                    </div>

                    <div className="flex justify-between items-end mt-2">
                      <div className="flex flex-wrap gap-1">
                        {roomTags.slice(0, 4).map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 bg-gray-50 text-gray-500 text-[10px] rounded">{tag}</span>
                        ))}
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="flex items-baseline gap-1">
                          <span className="text-xs text-amber-600 font-bold">¥</span>
                          <span className="text-xl text-amber-600 font-bold">{minRate}</span>
                          <span className="text-xs text-gray-400">起</span>
                        </div>
                        {roomDiscountHint && (
                          <span className="text-[10px] text-red-500 bg-red-50 px-1 rounded mt-0.5">{roomDiscountHint}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-gray-50/50 border-t border-gray-100 animate-fadeIn">
                    {room.rates.sort((a, b) => a.price - b.price).map(rate => {
                      const effectiveStock = rate.stock ?? room.stock;
                      const isSoldOut = !effectiveStock;
                      return (
                        <div key={rate.id} className="p-3 border-b border-gray-100 last:border-0 flex justify-between items-center hover:bg-gray-50 transition-colors">
                        <div className="flex-1 pr-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-gray-800">{rate.name}</h4>
                            {rate.type === BookingType.PLATINUM && <span className="text-[10px] bg-slate-800 text-amber-200 px-1 rounded">铂金卡</span>}
                            {rate.type === BookingType.CORPORATE && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">企</span>}
                            {rate.type === BookingType.NEW_USER && rate.newUserPopupStatus === 'ALERT' && (
                              <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded">新客弹窗</span>
                            )}
                            {effectiveStock !== undefined && effectiveStock > 0 && (
                              <span className={`text-[10px] px-1 rounded ${effectiveStock <= 3 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                余{effectiveStock}间
                              </span>
                            )}
                            {isSoldOut && (
                              <span className="text-[10px] px-1 rounded bg-gray-200 text-gray-700">
                                满房
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {rate.tags.map(tag => (
                              <span key={tag} className="text-[10px] text-amber-600 border border-amber-100 px-1 rounded bg-white">{tag}</span>
                            ))}
                          </div>
                          {rate.cancelTips && (
                            <p className="text-[10px] text-gray-500 mt-1">{rate.cancelTips}</p>
                          )}
                          {rate.type === BookingType.PLATINUM && (
                            <p className="text-[10px] text-gray-400 mt-1">{rate.rewardPointText || '本人入住可得消费积分'}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-baseline gap-1">
                            {rate.originalPrice && <span className="text-xs text-gray-300 line-through">¥{rate.originalPrice}</span>}
                            <span className="text-xs text-amber-600 font-bold">¥</span>
                            <span className="text-xl text-amber-600 font-bold">{rate.price}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCopyRateQuote(room, rate);
                              }}
                              className="px-2 py-1.5 bg-gray-100 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-gray-200"
                              title="复制此报价"
                            >
                              📋
                            </button>

                            <button
                              onClick={() => onSelectRate(room, rate)}
                              disabled={isSoldOut}
                              className={`px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm transition-transform ${
                                isSoldOut
                                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                  : 'active:scale-95 bg-amber-500 text-white'
                              }`}
                            >
                              {isSoldOut ? '满房' : '订'}
                            </button>
                          </div>

                          {(rate.discountTexts?.length || 0) > 0 && (
                            <span className="text-[10px] text-red-500">{rate.discountTexts?.[0]}</span>
                          )}
                        </div>
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
  );
};
