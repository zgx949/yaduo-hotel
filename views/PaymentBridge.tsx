import React, { useMemo, useState } from 'react';

const decodePayUrl = (raw: string): string => {
  if (!raw) {
    return '';
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export const PaymentBridge: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const payUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('payUrl') || '';
    return decodePayUrl(raw).trim();
  }, []);

  const qrSrc = useMemo(() => {
    if (!payUrl) {
      return '';
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(payUrl)}`;
  }, [payUrl]);

  const openAlipay = () => {
    if (!payUrl) {
      return;
    }
    window.location.href = payUrl;
  };

  const copyLink = async () => {
    if (!payUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(payUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-sky-50 text-gray-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">支付信息转接</h1>
          <p className="mt-2 text-sm text-gray-600">
            可直接唤起支付宝，也可展示二维码让手机扫码打开。
          </p>

          {!payUrl ? (
            <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm">
              未检测到支付链接，请从订单列表重新点击“支付链接”。
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={openAlipay}
                  className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
                >
                  直接唤起支付宝
                </button>
                <button
                  onClick={copyLink}
                  className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
                >
                  {copied ? '已复制' : '复制支付链接'}
                </button>
              </div>

              <div className="mt-6 grid md:grid-cols-2 gap-6 items-start">
                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-sm font-medium text-gray-700 mb-3">二维码扫码支付</p>
                  <div className="bg-white rounded-lg p-3 border border-gray-200 inline-block">
                    {qrSrc ? (
                      <img src={qrSrc} alt="支付二维码" className="w-64 h-64 md:w-72 md:h-72" />
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                  <p className="text-sm font-medium text-gray-700 mb-3">链接内容</p>
                  <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs break-all text-gray-700 leading-5 max-h-72 overflow-auto">
                    {payUrl}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
