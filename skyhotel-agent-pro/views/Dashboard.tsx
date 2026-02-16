import React from 'react';
import { Card } from '../components/ui/Card';
import { MOCK_ORDERS, MOCK_ALERTS, MOCK_ACCOUNTS } from '../constants';
import { AccountStatus } from '../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const DATA = [
  { name: '周一', sales: 4000 },
  { name: '周二', sales: 3000 },
  { name: '周三', sales: 2000 },
  { name: '周四', sales: 2780 },
  { name: '周五', sales: 5890 },
  { name: '周六', sales: 8390 },
  { name: '周日', sales: 3490 },
];

const STATUS_MAP: Record<string, string> = {
  'UNPAID': '待支付',
  'WAITING_CHECKIN': '待入住',
  'CONFIRMED': '已确认',
  'CANCELLED': '已取消',
  'COMPLETED': '已完成',
  'REFUNDING': '退款中'
};

export const Dashboard: React.FC = () => {
  const activeAccounts = MOCK_ACCOUNTS.filter(a => a.status === AccountStatus.ACTIVE).length;
  // Using UNPAID as the primary "Pending" metric for the dashboard
  const pendingOrders = MOCK_ORDERS.filter(o => o.status === 'UNPAID').length;
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">概览</h2>
            <p className="text-gray-500 text-sm">欢迎回来，今日业务动态如下。</p>
        </div>
        <div className="flex gap-2">
            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 text-gray-700">导出报表</button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm">同步数据</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-blue-500">
          <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">今日销售额</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">¥24,500</p>
          <p className="text-xs text-green-600 mt-2 flex items-center">
            <span className="font-bold">↑ 12%</span> <span className="ml-1 text-gray-400">较昨日</span>
          </p>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">活跃账号</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">{activeAccounts}/{MOCK_ACCOUNTS.length}</p>
          <p className="text-xs text-gray-400 mt-2">运行正常</p>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">待处理订单</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">{pendingOrders}</p>
          <p className="text-xs text-amber-600 mt-2">需要处理</p>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">低价提醒</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">{MOCK_ALERTS.length}</p>
          <p className="text-xs text-gray-400 mt-2">新机会</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card title="销售趋势">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={DATA}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `¥${value}`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    formatter={(value: number) => [`¥${value}`, '销售额']}
                  />
                  <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="最近订单">
            <div className="space-y-4">
              {MOCK_ORDERS.slice(0, 3).map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{order.hotelName}</p>
                    <p className="text-xs text-gray-500">{order.customerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">¥{order.price}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      (order.status === 'CONFIRMED' || order.status === 'WAITING_CHECKIN') ? 'bg-green-100 text-green-700' :
                      order.status === 'UNPAID' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {STATUS_MAP[order.status] || order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          
          <Card title="快捷操作">
            <div className="grid grid-cols-2 gap-3">
               <button className="p-3 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors flex flex-col items-center gap-2">
                 <span className="text-xl">🎫</span>
                 核销/查券
               </button>
               <button className="p-3 bg-purple-50 text-purple-600 rounded-lg text-xs font-semibold hover:bg-purple-100 transition-colors flex flex-col items-center gap-2">
                 <span className="text-xl">📅</span>
                 自动签到
               </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};