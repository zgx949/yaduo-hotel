import React from 'react';
import { Hotel, RatePlan, Room } from '../../types';
import { VALUE_ADDED_SERVICES } from '../../constants';
import { InvoiceFormValue } from '../../components/InvoiceFormSheet';

interface BookingFormState {
  guestName: string;
  guestPhone: string;
  note: string;
}

interface BenefitState {
  breakfast: number;
  upgrade: number;
  lateCheckout: number;
  slippers: number;
}

interface BookingConfirmViewProps {
  selectedHotel: Hotel;
  selectedRoom: Room;
  selectedRate: RatePlan;
  checkIn: string;
  checkOut: string;
  bookingForm: BookingFormState;
  onBookingFormChange: (patch: Partial<BookingFormState>) => void;
  selectedBenefits: BenefitState;
  onUpdateBenefit: (type: keyof BenefitState, delta: number) => void;
  appliedCoupon: { name: string; value: number } | null;
  invoiceEnabled: boolean;
  invoiceForm: InvoiceFormValue;
  onToggleInvoice: () => void;
  onBack: () => void;
  onSubmit: () => void;
  isLoading: boolean;
  getDisplayDate: (dateStr: string) => string;
  getNightCount: () => number;
}

export const BookingConfirmView: React.FC<BookingConfirmViewProps> = ({
  selectedHotel,
  selectedRoom,
  selectedRate,
  checkIn,
  checkOut,
  bookingForm,
  onBookingFormChange,
  selectedBenefits,
  onUpdateBenefit,
  appliedCoupon,
  invoiceEnabled,
  invoiceForm,
  onToggleInvoice,
  onBack,
  onSubmit,
  isLoading,
  getDisplayDate,
  getNightCount
}) => {
  const nightCount = getNightCount();
  const totalPrice = (selectedRate.price * nightCount) - (appliedCoupon?.value || 0);
  const totalDiscount = (selectedRate.originalPrice ? (selectedRate.originalPrice - selectedRate.price) : 0) + (appliedCoupon?.value || 0);
  const breakfastText = typeof selectedRate.breakfastCount === 'number'
    ? (selectedRate.breakfastCount > 0 ? `${selectedRate.breakfastCount}份早餐` : '无早餐')
    : '早餐以酒店确认为准';
  const stockHint = selectedRate.stock ?? selectedRoom.stock;

  return (
    <div className="bg-gray-50 min-h-full flex flex-col pb-32">
      <div className="bg-white/95 backdrop-blur-sm sticky top-0 z-30 px-4 py-3 flex items-center gap-2 shadow-sm">
        <button onClick={onBack} className="p-1 -ml-2 text-gray-800">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="font-bold text-lg text-gray-900 truncate">{selectedHotel.name}</h1>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-xl font-bold text-gray-900">{selectedRoom.name}</h2>
            <button className="text-xs text-gray-400 flex items-center">
              房型详情 <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">{selectedRoom.size} | {selectedRoom.bed} | {selectedRoom.window} | {breakfastText}</p>

          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-lg text-gray-900">{getDisplayDate(checkIn)}</span>
              <span className="text-xs text-gray-500">今天</span>
            </div>
            <div className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium">{nightCount} 晚</div>
            <div className="flex items-baseline gap-2 justify-end">
              <span className="font-bold text-lg text-gray-900">{getDisplayDate(checkOut)}</span>
              <span className="text-xs text-gray-500">明天</span>
            </div>
          </div>
          <p className="text-xs text-orange-400 mt-2">{selectedRate.cancelTips || '取消规则以酒店确认为准'} {">"}</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
          <h3 className="font-bold text-base text-gray-900">入住信息</h3>
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <label className="text-sm text-gray-600 w-20">入住人<span className="text-red-500">*</span></label>
            <input
              type="text"
              className="flex-1 outline-none text-right font-medium text-gray-900"
              value={bookingForm.guestName}
              onChange={e => onBookingFormChange({ guestName: e.target.value })}
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
              onChange={e => onBookingFormChange({ guestPhone: e.target.value })}
            />
          </div>
        </div>

        <div className="rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="bg-gradient-to-r from-slate-200 to-slate-100 p-3 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm"><span className="text-amber-600">♛</span> 铂金会员专享</h3>
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
                { key: 'slippers', label: '专属拖鞋', total: 3 }
              ].map(benefit => (
                <div key={benefit.key} className="bg-orange-50/50 rounded-lg p-2 flex flex-col items-center justify-between h-28 relative">
                  {benefit.tag && <span className="absolute -top-1.5 bg-amber-200 text-amber-800 text-[8px] px-1 rounded">{benefit.tag}</span>}
                  <div className="text-center mt-2">
                    <div className="text-xs font-bold text-gray-800 leading-tight mb-1">{benefit.label}</div>
                    <div className="text-[10px] text-gray-500">可用 {benefit.total} 张</div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => onUpdateBenefit(benefit.key as keyof BenefitState, -1)}
                      className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs ${
                        selectedBenefits[benefit.key as keyof BenefitState] > 0 ? 'border-amber-500 text-amber-500 bg-white' : 'border-gray-200 text-gray-300'
                      }`}
                    >-</button>
                    <span className="text-sm font-bold w-3 text-center">{selectedBenefits[benefit.key as keyof BenefitState]}</span>
                    <button
                      onClick={() => onUpdateBenefit(benefit.key as keyof BenefitState, 1)}
                      className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs ${
                        selectedBenefits[benefit.key as keyof BenefitState] < benefit.total ? 'border-amber-500 text-amber-500 bg-white' : 'border-gray-200 text-gray-300'
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
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white font-bold text-xs p-1 text-center">{service.name}</div>
                  </div>
                  <span className="text-[10px] text-gray-500">{service.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-600">开发票</span>
              <span className="w-3 h-3 rounded-full bg-gray-200 text-white flex items-center justify-center text-[8px]">?</span>
            </div>
            <div onClick={onToggleInvoice} className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${invoiceEnabled ? 'bg-green-500' : 'bg-gray-200'}`}>
              <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${invoiceEnabled ? 'translate-x-4' : ''}`}></div>
            </div>
          </div>
          {invoiceEnabled && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-900 space-y-1">
              <div>类型：{invoiceForm.type === 'VAT' ? '增值税专用发票（电子）' : '普通发票（电子）'}</div>
              <div>抬头类型：{invoiceForm.titleType === 'COMPANY' ? '企业单位' : '个人/非企业单位'}</div>
              <div>抬头：{invoiceForm.title || '未填写'}</div>
              {invoiceForm.titleType === 'COMPANY' && (
                <div>税号：{invoiceForm.taxNo || '未填写（选填）'}</div>
              )}
              <div>邮箱：{invoiceForm.email || '未填写'}</div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-gray-600">备注要求</label>
            <textarea
              value={bookingForm.note}
              onChange={(e) => onBookingFormChange({ note: e.target.value })}
              placeholder="例如：无烟房、尽量安静、靠近电梯等"
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-orange-800 bg-orange-50 p-2 rounded-lg">
          <span className="bg-orange-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">!</span>
          {typeof stockHint === 'number' && stockHint > 0
            ? (stockHint <= 3 ? `房量紧张 当前仅剩${stockHint}间` : `当前可预订 ${stockHint} 间`)
            : '房量以酒店实时查询结果为准'}
        </div>
      </div>

      <div className="sticky bottom-0 bg-white border-t border-gray-200 safe-bottom p-4 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="max-w-3xl mx-auto flex justify-between items-center gap-4">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-amber-600">¥</span>
              <span className="text-3xl font-bold text-amber-600">{totalPrice}</span>
              <span className="text-xs text-gray-500 ml-1">{selectedRate.name}</span>
            </div>
            <div className="text-xs text-gray-400">已优惠 ¥{totalDiscount} <span className="underline">账单明细</span></div>
          </div>
          <button
            onClick={onSubmit}
            disabled={isLoading}
            className="bg-[#1d3c34] text-white px-10 py-3 rounded-lg font-bold text-lg shadow-lg hover:bg-[#152e28] active:scale-95 transition-all flex items-center gap-2"
          >
            {isLoading ? '提交中...' : '立即支付'}
          </button>
        </div>
      </div>
    </div>
  );
};
