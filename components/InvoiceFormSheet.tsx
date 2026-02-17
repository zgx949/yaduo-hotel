import React, { useEffect, useRef, useState } from 'react';

export type InvoiceType = 'NORMAL' | 'VAT';
export type InvoiceTitleType = 'PERSONAL' | 'COMPANY';

export interface InvoiceFormValue {
  type: InvoiceType;
  titleType: InvoiceTitleType;
  title: string;
  taxNo: string;
  companyAddress: string;
  companyPhone: string;
  bankName: string;
  bankAccount: string;
  email: string;
  specialRequestEnabled: boolean;
  specialRequestNote: string;
}

interface InvoiceFormSheetProps {
  isOpen: boolean;
  initialValue: InvoiceFormValue;
  onClose: () => void;
  onConfirm: (value: InvoiceFormValue) => void;
}

export const InvoiceFormSheet: React.FC<InvoiceFormSheetProps> = ({
  isOpen,
  initialValue,
  onClose,
  onConfirm
}) => {
  const [draft, setDraft] = useState<InvoiceFormValue>(initialValue);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(initialValue);
      setError('');
    }
  }, [isOpen, initialValue]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) {
      return;
    }

    // Lock the nearest scrollable host and jump to top to keep close button visible.
    let host: HTMLElement | null = containerRef.current.parentElement;
    while (host) {
      const style = window.getComputedStyle(host);
      if (/(auto|scroll)/.test(style.overflowY) && host.scrollHeight > host.clientHeight) {
        break;
      }
      host = host.parentElement;
    }

    if (!host) {
      return;
    }

    const originalOverflow = host.style.overflowY;
    host.scrollTop = 0;
    host.style.overflowY = 'hidden';

    return () => {
      host.style.overflowY = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const validateAndConfirm = () => {
    if (!draft.title.trim()) {
      setError('请先填写发票抬头');
      return;
    }
    if (!draft.email.trim()) {
      setError('请先填写接收邮箱');
      return;
    }

    if (draft.titleType === 'COMPANY' && draft.type === 'VAT') {
      if (!draft.companyAddress.trim()) {
        setError('增值税专票请填写公司注册地址');
        return;
      }
      if (!draft.companyPhone.trim()) {
        setError('增值税专票请填写公司电话（区号-总机）');
        return;
      }
      if (!draft.bankName.trim()) {
        setError('增值税专票请填写开户银行');
        return;
      }
      if (!draft.bankAccount.trim()) {
        setError('增值税专票请填写开户账号');
        return;
      }
    }

    setError('');
    onConfirm(draft);
  };

  return (
    <div ref={containerRef} className="absolute inset-0 z-[90] bg-white">
      <div className="h-full flex flex-col">
        <div
          className="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between flex-shrink-0"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}
        >
          <h3 className="text-2xl font-bold text-gray-900">发票</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-3xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto flex-1">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xl font-bold text-gray-900">发票类型</h4>
              <button className="text-emerald-800 underline text-sm">发票说明</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, type: 'NORMAL' }))}
                className={`rounded-xl px-3 py-4 text-lg font-semibold border ${
                  draft.type === 'NORMAL'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-gray-50 border-gray-100 text-gray-700'
                }`}
              >
                普通发票（电子）
              </button>
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, type: 'VAT' }))}
                className={`rounded-xl px-3 py-4 text-lg font-semibold border ${
                  draft.type === 'VAT'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-gray-50 border-gray-100 text-gray-700'
                }`}
              >
                增值税专用发票（电子）
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <h5 className="text-lg font-bold text-gray-900">发票信息</h5>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, titleType: 'PERSONAL' }))}
                className={`rounded-lg py-2 text-sm font-semibold border ${
                  draft.titleType === 'PERSONAL'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                个人/非企业单位
              </button>
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, titleType: 'COMPANY' }))}
                className={`rounded-lg py-2 text-sm font-semibold border ${
                  draft.titleType === 'COMPANY'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                企业单位
              </button>
            </div>
            <div className="bg-gray-50 rounded-xl px-3 py-3">
              <label className="text-sm text-gray-600">发票抬头</label>
              <input
                value={draft.title}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="请输入发票抬头"
                className="w-full bg-transparent mt-1 text-base text-gray-900 outline-none"
              />
            </div>
            {draft.titleType === 'COMPANY' && (
              <div className="bg-gray-50 rounded-xl px-3 py-3">
                <label className="text-sm text-gray-600">税号（选填）</label>
                <input
                  value={draft.taxNo}
                  onChange={(e) => setDraft((prev) => ({ ...prev, taxNo: e.target.value }))}
                  placeholder="请输入企业税号"
                  className="w-full bg-transparent mt-1 text-base text-gray-900 outline-none"
                />
              </div>
            )}
            {draft.titleType === 'COMPANY' && draft.type === 'VAT' && (
              <div className="space-y-2">
                <div className="bg-gray-50 rounded-xl px-3 py-3">
                  <label className="text-sm text-gray-600">公司注册地址</label>
                  <input
                    value={draft.companyAddress}
                    onChange={(e) => setDraft((prev) => ({ ...prev, companyAddress: e.target.value }))}
                    placeholder="请输入公司注册地址"
                    className="w-full bg-transparent mt-1 text-base text-gray-900 outline-none"
                  />
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-3">
                  <label className="text-sm text-gray-600">公司电话（区号-总机）</label>
                  <input
                    value={draft.companyPhone}
                    onChange={(e) => setDraft((prev) => ({ ...prev, companyPhone: e.target.value }))}
                    placeholder="例如 021-88886666"
                    className="w-full bg-transparent mt-1 text-base text-gray-900 outline-none"
                  />
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-3">
                  <label className="text-sm text-gray-600">开户银行</label>
                  <input
                    value={draft.bankName}
                    onChange={(e) => setDraft((prev) => ({ ...prev, bankName: e.target.value }))}
                    placeholder="请输入开户银行"
                    className="w-full bg-transparent mt-1 text-base text-gray-900 outline-none"
                  />
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-3">
                  <label className="text-sm text-gray-600">开户账号</label>
                  <input
                    value={draft.bankAccount}
                    onChange={(e) => setDraft((prev) => ({ ...prev, bankAccount: e.target.value }))}
                    placeholder="请输入开户账号"
                    className="w-full bg-transparent mt-1 text-base text-gray-900 outline-none"
                  />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h5 className="text-lg font-bold text-gray-900">发票接收信息</h5>
            <div className="bg-gray-50 rounded-xl px-3 py-3">
              <label className="text-sm text-gray-600">邮箱</label>
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="请输入邮箱"
                className="w-full bg-transparent mt-1 text-base text-gray-900 outline-none"
              />
            </div>
          </section>

          <section className="space-y-3">
            <h5 className="text-lg font-bold text-gray-900">开票备注</h5>
            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-3">
              <span className="text-base text-gray-800">特殊开票要求</span>
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, specialRequestEnabled: !prev.specialRequestEnabled }))}
                className={`w-11 h-6 rounded-full p-1 transition-colors ${
                  draft.specialRequestEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                    draft.specialRequestEnabled ? 'translate-x-5' : ''
                  }`}
                ></span>
              </button>
            </div>
            {draft.specialRequestEnabled && (
              <textarea
                value={draft.specialRequestNote}
                onChange={(e) => setDraft((prev) => ({ ...prev, specialRequestNote: e.target.value }))}
                rows={3}
                placeholder="请输入特殊开票要求"
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            )}
          </section>

          <section className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600 leading-6">
            <h5 className="text-gray-900 font-bold mb-1">电子发票说明</h5>
            如您的发票信息提交成功，将在办理退房后 24 小时内自动发送至您填写的邮箱。若超时未收到，请及时联系酒店前台。
          </section>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="pb-6 pt-1">
            <button
              type="button"
              onClick={validateAndConfirm}
              className="w-full bg-emerald-900 text-white text-2xl font-bold py-4 rounded-2xl hover:bg-emerald-800 transition-colors"
            >
              确认发票信息
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
