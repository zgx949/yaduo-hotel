import React from 'react';
import { Card } from '../components/ui/Card';
import { MOCK_ORDERS } from '../constants';

export const Invoices: React.FC = () => {
  const invoiceOrders = MOCK_ORDERS.filter(o => o.invoiceRequested);

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">发票管理</h2>
            <p className="text-gray-500 text-sm">管理已完成订单的税务发票。</p>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-medium">
              <tr>
                <th className="px-6 py-3">订单号</th>
                <th className="px-6 py-3">客户</th>
                <th className="px-6 py-3">金额</th>
                <th className="px-6 py-3">状态</th>
                <th className="px-6 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoiceOrders.map(order => (
                <tr key={order.id} className="hover:bg-gray-50/50">
                  <td className="px-6 py-4 font-medium text-gray-900">{order.id}</td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-gray-900">{order.customerName}</p>
                      <p className="text-xs text-gray-500">{order.hotelName}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono">¥{order.price.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      order.invoiceIssued 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {order.invoiceIssued ? '已开票' : '待开票'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {!order.invoiceIssued && (
                      <button className="text-blue-600 hover:text-blue-800 font-medium hover:underline">
                        生成发票
                      </button>
                    )}
                    {order.invoiceIssued && (
                      <button className="text-gray-500 hover:text-gray-700 font-medium hover:underline">
                        下载 PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {invoiceOrders.length === 0 && (
                 <tr>
                   <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                     暂无待处理的发票请求。
                   </td>
                 </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
