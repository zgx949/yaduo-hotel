
import React, { useState, useMemo } from 'react';
import { MOCK_ORDERS, MOCK_BLACKLIST } from '../constants';
import { Order, SystemUser } from '../types';
import { Card } from '../components/ui/Card';

type ViewMode = 'CARD' | 'LIST';

interface OrdersProps {
    currentUser?: SystemUser | null;
}

export const Orders: React.FC<OrdersProps> = ({ currentUser }) => {
  const [activeStatus, setActiveStatus] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('CARD');
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = useState<string | null>(null);
  
  // Blacklist States
  const [showBlacklistModal, setShowBlacklistModal] = useState(false); // For adding new
  const [blacklistReason, setBlacklistReason] = useState('');
  const [showBlacklistDetails, setShowBlacklistDetails] = useState(false); // For viewing existing

  // Enhanced Filter Logic
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // 0. Permission Filter (Admin sees all, User sees own)
      if (currentUser && currentUser.role !== 'ADMIN') {
          if (o.creatorId !== currentUser.id) return false;
      }

      // 1. Status Filter
      let statusMatch = true;
      if (activeStatus === 'WAITING_PAYMENT') statusMatch = o.status === 'UNPAID';
      else if (activeStatus === 'WAITING_CHECKIN') statusMatch = o.status === 'WAITING_CHECKIN' || o.status === 'CONFIRMED';
      else if (activeStatus === 'COMPLETED') statusMatch = o.status === 'COMPLETED';

      // 2. Search Query (Name, Hotel, ID, Creator)
      const query = searchQuery.toLowerCase();
      const searchMatch = !query || 
          o.customerName.toLowerCase().includes(query) || 
          o.hotelName.toLowerCase().includes(query) || 
          o.id.toLowerCase().includes(query) ||
          (o.creatorName && o.creatorName.toLowerCase().includes(query));

      // 3. Date Filter (Check-in)
      const dateMatch = !filterDate || o.checkIn === filterDate;

      return statusMatch && searchMatch && dateMatch;
    });
  }, [orders, activeStatus, searchQuery, filterDate, currentUser]);

  // Calculate blacklist records for selected order
  const activeBlacklistRecords = useMemo(() => {
      if (!selectedOrder) return [];
      return MOCK_BLACKLIST.filter(r => r.hotelName === selectedOrder.hotelName);
  }, [selectedOrder]);

  const handleRequestInvoice = (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    // Simulate updating order state
    const newOrders = orders.map(o => o.id === orderId ? { ...o, invoiceRequested: true } : o);
    setOrders(newOrders);
    
    if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, invoiceRequested: true });
    }

    setInvoiceSuccess(orderId);
    setTimeout(() => setInvoiceSuccess(null), 3000);
  };
  
  const handleSubmitBlacklist = () => {
      if (!selectedOrder) return;
      alert(`已将【${selectedOrder.hotelName}】加入黑名单。\n原因：${blacklistReason}\n后续预订该酒店时将收到警告。`);
      setShowBlacklistModal(false);
      setBlacklistReason('');
      setSelectedOrder(null); // Close order detail as well
  };

  const handleSelectOrder = (order: Order) => {
      setSelectedOrder(order);
      setShowBlacklistDetails(false); // Reset details view
  };

  const getStatusDisplay = (status: string) => {
    switch(status) {
        case 'UNPAID': return { text: '待支付', color: 'text-red-500', bg: 'bg-red-50' };
        case 'WAITING_CHECKIN': return { text: '待入住', color: 'text-green-600', bg: 'bg-green-50' };
        case 'CONFIRMED': return { text: '预订成功', color: 'text-green-600', bg: 'bg-green-50' };
        case 'COMPLETED': return { text: '已离店', color: 'text-gray-500', bg: 'bg-gray-100' };
        case 'CANCELLED': return { text: '已取消', color: 'text-gray-400', bg: 'bg-gray-50' };
        default: return { text: status, color: 'text-gray-500', bg: 'bg-gray-50' };
    }
  };

  // --- Components ---

  const OrderCard = ({ order }: { order: Order }) => {
    const statusStyle = getStatusDisplay(order.status);
    const isBlacklisted = MOCK_BLACKLIST.some(b => b.hotelName === order.hotelName);
    
    return (
      <div 
        onClick={() => handleSelectOrder(order)}
        className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer space-y-3 relative overflow-hidden"
      >
        {isBlacklisted && <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>}
        
        {/* Header */}
        <div className="flex justify-between items-start pl-2">
            <div className="flex flex-col">
                <h3 className="font-bold text-gray-800 text-base truncate pr-2 flex items-center gap-1">
                    {order.hotelName}
                </h3>
                {isBlacklisted && <span className="text-[10px] text-red-500 font-medium">⚠️ 存在黑名单记录</span>}
            </div>
            <span className={`text-sm font-medium whitespace-nowrap ${statusStyle.color}`}>{statusStyle.text}</span>
        </div>

        {/* Body */}
        <div className="space-y-1 pl-2">
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800 font-medium">{order.roomType || '标准房'}</span>
                {order.tags && order.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-1 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded">
                        {tag}
                    </span>
                ))}
            </div>
            <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                <span>{order.customerName}</span>
                <span>{order.checkIn} 入住</span>
            </div>
            {/* Creator Info */}
            <div className="flex items-center gap-1 pt-1">
                 <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-[10px]">👤</span>
                 <span className="text-xs text-gray-400">{order.creatorName || '未知用户'}</span>
            </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t border-gray-50 pl-2">
            <div className="font-semibold text-lg text-gray-900">
                <span className="text-xs font-normal">¥</span>{order.price}
            </div>
            <div className="flex gap-2">
                {order.status === 'UNPAID' && (
                    <button className="px-3 py-1.5 rounded-full border border-red-500 text-red-500 text-xs font-medium hover:bg-red-50">
                        去支付
                    </button>
                )}
                {(order.status === 'WAITING_CHECKIN' || order.status === 'CONFIRMED') && (
                    <button className="px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50">
                        取消
                    </button>
                )}
                <button className="px-3 py-1.5 rounded-full border border-blue-600 bg-white text-blue-600 text-xs font-medium hover:bg-blue-50">
                    再次预订
                </button>
            </div>
        </div>
      </div>
    );
  };

  const OrderListRow = ({ order }: { order: Order }) => {
      const statusStyle = getStatusDisplay(order.status);
      const isBlacklisted = MOCK_BLACKLIST.some(b => b.hotelName === order.hotelName);

      return (
        <tr 
            onClick={() => handleSelectOrder(order)}
            className="hover:bg-blue-50/50 transition-colors cursor-pointer group relative"
        >
            <td className="px-6 py-4">
                {isBlacklisted && <span className="absolute left-0 top-4 bottom-4 w-1 bg-red-500 rounded-r"></span>}
                <div className="font-mono text-xs text-gray-500">{order.id}</div>
                <div className="font-medium text-gray-900 flex items-center gap-2">
                    {order.hotelName}
                    {isBlacklisted && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="存在黑名单记录"></span>}
                </div>
            </td>
            <td className="px-6 py-4">
                <div className="text-sm text-gray-900">{order.customerName}</div>
                <div className="text-xs text-gray-500">{order.roomType}</div>
            </td>
            <td className="px-6 py-4">
                <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-500">
                        {order.creatorName}
                    </span>
                </div>
            </td>
            <td className="px-6 py-4">
                <div className="text-sm text-gray-900">{order.checkIn}</div>
                <div className="text-xs text-gray-400">{Math.floor((new Date(order.checkOut).getTime() - new Date(order.checkIn).getTime())/(1000*60*60*24))}晚 · 至 {order.checkOut}</div>
            </td>
            <td className="px-6 py-4">
                <div className="font-bold text-gray-900">¥{order.price}</div>
                {order.tags && order.tags.length > 0 && (
                    <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded border border-amber-100">{order.tags[0]}</span>
                )}
            </td>
            <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusStyle.bg} ${statusStyle.color}`}>
                    {statusStyle.text}
                </span>
            </td>
            <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     {order.status === 'COMPLETED' && !order.invoiceRequested && (
                        <button 
                            onClick={(e) => handleRequestInvoice(e, order.id)}
                            className="text-blue-600 hover:underline text-xs"
                        >
                            {invoiceSuccess === order.id ? '已申请' : '开发票'}
                        </button>
                     )}
                     <button className="text-gray-500 hover:text-blue-600 text-xs">详情</button>
                </div>
            </td>
        </tr>
      );
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* 1. Header & Status Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
         <div>
             <h2 className="text-2xl font-bold text-gray-800">酒店订单</h2>
             {currentUser?.role === 'ADMIN' && (
                 <p className="text-xs text-gray-500 mt-1">管理员视图：可查看所有用户订单</p>
             )}
         </div>
         <div className="flex bg-white p-1 rounded-lg border border-gray-200 overflow-x-auto">
             {['ALL', 'UNPAID', 'WAITING_CHECKIN', 'COMPLETED'].map((status) => {
                 const labels: Record<string, string> = { ALL: '全部', UNPAID: '待支付', WAITING_CHECKIN: '待入住', COMPLETED: '待评价' };
                 return (
                     <button
                        key={status}
                        onClick={() => setActiveStatus(status)}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                            activeStatus === status ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                     >
                        {labels[status]}
                        {status === 'WAITING_CHECKIN' && <span className="ml-1 inline-block w-1.5 h-1.5 bg-red-500 rounded-full align-top"></span>}
                     </button>
                 )
             })}
         </div>
      </div>

      {/* 2. Filters & View Toggle */}
      <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
              <input 
                 type="text" 
                 placeholder={currentUser?.role === 'ADMIN' ? "搜索订单号 / 酒店 / 下单人姓名" : "搜索订单号 / 酒店"}
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
          </div>
          <div className="flex items-center gap-2">
               <span className="text-xs text-gray-500 whitespace-nowrap pl-1">入住日期:</span>
               <input 
                  type="date" 
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
               />
          </div>
          <div className="w-px bg-gray-200 hidden md:block mx-1"></div>
          <div className="flex bg-gray-100 p-1 rounded-lg self-start md:self-auto">
              <button 
                onClick={() => setViewMode('CARD')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'CARD' ? 'bg-white shadow text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                title="卡片视图"
              >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              </button>
              <button 
                onClick={() => setViewMode('LIST')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'LIST' ? 'bg-white shadow text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                title="列表视图"
              >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
          </div>
      </div>

      {/* 3. Orders Display Area */}
      <div className="flex-1 overflow-y-auto min-h-0">
         {filteredOrders.length === 0 ? (
             <div className="py-20 text-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                 <span className="text-4xl block mb-2">📭</span>
                 没有找到符合条件的订单
             </div>
         ) : viewMode === 'CARD' ? (
             // Card Grid View
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 pb-4 pr-2">
                {filteredOrders.map(order => (
                    <OrderCard key={order.id} order={order} />
                ))}
             </div>
         ) : (
             // List Table View
             <Card className="flex flex-col p-0 pb-4">
                 <div className="overflow-x-auto">
                     <table className="w-full text-sm text-left">
                         <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 shadow-sm z-10">
                             <tr>
                                 <th className="px-6 py-3">订单号 / 酒店</th>
                                 <th className="px-6 py-3">入住人 / 房型</th>
                                 <th className="px-6 py-3">下单人</th>
                                 <th className="px-6 py-3">入离时间</th>
                                 <th className="px-6 py-3">金额</th>
                                 <th className="px-6 py-3">状态</th>
                                 <th className="px-6 py-3 text-right">操作</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100">
                             {filteredOrders.map(order => (
                                 <OrderListRow key={order.id} order={order} />
                             ))}
                         </tbody>
                     </table>
                 </div>
                 <div className="px-6 pt-4 text-xs text-gray-400 flex justify-between">
                     <span>共 {filteredOrders.length} 条记录</span>
                 </div>
             </Card>
         )}
      </div>

      {/* Detail Modal Overlay */}
      {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedOrder(null)}>
              <div className="bg-gray-100 w-full max-w-md h-[85vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col relative" onClick={e => e.stopPropagation()}>
                  {/* Modal Header */}
                  <div className="bg-white p-4 flex justify-center items-center relative border-b border-gray-100">
                      <h3 className="font-semibold text-gray-800">订单详情</h3>
                      <button 
                        onClick={() => setSelectedOrder(null)}
                        className="absolute right-4 text-gray-400 hover:text-gray-800"
                      >
                        ✕
                      </button>
                      <div className="absolute right-12 text-blue-600 text-sm">
                          <span className="text-xs">🎁</span> 分享
                      </div>
                  </div>

                  {/* Scrollable Content */}
                  <div className="overflow-y-auto flex-1 p-4 space-y-4">
                      {/* Status Header */}
                      <div className="bg-white p-6 rounded-xl text-center space-y-2">
                          <h2 className="text-2xl font-bold text-gray-800">
                              {getStatusDisplay(selectedOrder.status).text}
                          </h2>
                          <p className="text-xs text-gray-500">房间将为您整晚保留</p>
                          {selectedOrder.status === 'WAITING_CHECKIN' && (
                              <p className="text-xs text-orange-500">2026-02-15 12:00前可免费取消</p>
                          )}
                          
                          <div className="flex justify-center gap-4 mt-4 text-xs font-medium text-gray-600">
                              <button className="px-3 py-2 bg-gray-50 rounded-lg flex flex-col items-center gap-1 min-w-[60px]">
                                  <span>🛡️</span> 亚朵锦囊
                              </button>
                              <button 
                                onClick={() => setShowBlacklistModal(true)}
                                className="px-3 py-2 bg-red-50 text-red-600 rounded-lg flex flex-col items-center gap-1 min-w-[60px]"
                              >
                                  <span>🚫</span> 拉黑/避雷
                              </button>
                              <button className="px-3 py-2 bg-gray-50 rounded-lg flex flex-col items-center gap-1 min-w-[60px]">
                                  <span>📝</span> 备选要求
                              </button>
                              <button className="px-3 py-2 bg-gray-50 rounded-lg flex flex-col items-center gap-1 min-w-[60px]">
                                  <span>❌</span> 取消订单
                              </button>
                          </div>
                      </div>

                      {/* Amount */}
                      <div className="bg-white px-4 py-3 rounded-xl flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-600">订单金额</span>
                          <span className="text-lg font-bold text-amber-600">¥{selectedOrder.price}</span>
                      </div>

                      {/* Ad Banner Mockup */}
                      <div className="bg-gradient-to-r from-red-500 to-amber-600 rounded-xl p-4 text-white flex justify-between items-center shadow-lg">
                          <div>
                              <p className="font-bold text-lg">送好友礼包 赚返利</p>
                              <p className="text-xs opacity-90">邀请好友下单，双方得奖励</p>
                          </div>
                          <div className="bg-white/20 p-2 rounded-full">🎁</div>
                      </div>

                      {/* Hotel Info */}
                      <div className="bg-white p-4 rounded-xl space-y-3">
                          <div>
                              <h4 className="font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                                {selectedOrder.hotelName}
                                {activeBlacklistRecords.length > 0 && (
                                    <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 border border-red-200">
                                        ⚠️ 黑名单
                                    </span>
                                )}
                              </h4>
                              
                              {/* Blacklist Warning Section */}
                              {activeBlacklistRecords.length > 0 && (
                                <div className="bg-red-50 border border-red-100 rounded-lg p-3 mt-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2 text-red-700 font-bold text-xs">
                                            <span>🚫</span> 风险提示：该酒店存在 {activeBlacklistRecords.length} 条同行避雷记录
                                        </div>
                                        <button 
                                            onClick={() => setShowBlacklistDetails(!showBlacklistDetails)} 
                                            className="text-xs text-red-500 underline hover:text-red-700 whitespace-nowrap ml-2"
                                        >
                                            {showBlacklistDetails ? '收起详情' : '查看详情'}
                                        </button>
                                    </div>
                                    {showBlacklistDetails && (
                                        <div className="mt-2 space-y-2 animate-fadeIn">
                                            {activeBlacklistRecords.map(record => (
                                                <div key={record.id} className="text-xs text-gray-600 bg-white p-2 rounded border border-red-100 shadow-sm">
                                                    <div className="flex justify-between mb-1">
                                                        <span className={`font-bold ${record.severity === 'HIGH' ? 'text-red-600' : 'text-orange-500'}`}>
                                                            [{record.severity === 'HIGH' ? '严重' : '一般'}]
                                                        </span>
                                                        <span className="text-gray-400">{record.date}</span>
                                                    </div>
                                                    <p className="leading-relaxed">{record.reason}</p>
                                                    <div className="mt-1 text-gray-400 text-[10px] text-right">上报人: {record.reportedBy}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                              )}

                              <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                  {selectedOrder.hotelAddress || '地址信息加载中...'} 
                                  <span className="ml-1 text-blue-600">【地图】</span>
                              </p>
                          </div>
                          <hr className="border-gray-50"/>
                          <div className="flex gap-4">
                              <div className="flex-1">
                                  <p className="font-bold text-gray-800 text-sm">{selectedOrder.roomType || '标准客房'} x1</p>
                                  <p className="text-xs text-gray-400 mt-1">32m² | 双床1.2m | 外窗 | 无早餐</p>
                              </div>
                          </div>
                          <div className="flex justify-between text-sm pt-2">
                              <div>
                                  <p className="text-gray-400 text-xs">入住</p>
                                  <p className="font-medium">{selectedOrder.checkIn}</p>
                              </div>
                              <div className="text-right">
                                  <p className="text-gray-400 text-xs">离店</p>
                                  <p className="font-medium">{selectedOrder.checkOut}</p>
                              </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                              <button className="py-2 bg-gray-50 text-gray-600 text-xs rounded-lg font-medium">酒店地址</button>
                              <button className="py-2 bg-gray-50 text-gray-600 text-xs rounded-lg font-medium">联系酒店</button>
                          </div>
                      </div>

                      {/* Order Details */}
                      <div className="bg-white p-4 rounded-xl space-y-3 mb-4">
                           <h4 className="font-bold text-gray-900 text-sm">订单信息</h4>
                           <div className="space-y-2 text-xs">
                               <div className="flex justify-between">
                                   <span className="text-gray-500">订单号</span>
                                   <span className="text-gray-900">{selectedOrder.id}1642711</span>
                               </div>
                               <div className="flex justify-between">
                                   <span className="text-gray-500">预订时间</span>
                                   <span className="text-gray-900">{selectedOrder.createdAt} 20:03:00</span>
                               </div>
                               <div className="flex justify-between">
                                   <span className="text-gray-500">预订人</span>
                                   <span className="text-gray-900">{selectedOrder.customerName}</span>
                               </div>
                               <div className="flex justify-between">
                                   <span className="text-gray-500">下单员</span>
                                   <span className="text-gray-900">{selectedOrder.creatorName || '-'}</span>
                               </div>
                               <div className="flex justify-between">
                                   <span className="text-gray-500">联系人</span>
                                   <span className="text-gray-900">{selectedOrder.customerName}</span>
                               </div>
                               <div className="flex justify-between">
                                   <span className="text-gray-500">备注</span>
                                   <span className="text-gray-900 text-right w-2/3 truncate">需要安静风景好的房间，不要首尾房</span>
                               </div>
                           </div>
                           
                           {/* Invoice Action in Detail View */}
                           <div className="pt-2 border-t border-gray-50 flex justify-end">
                                {selectedOrder.status === 'COMPLETED' && !selectedOrder.invoiceRequested ? (
                                    <button 
                                        onClick={(e) => handleRequestInvoice(e, selectedOrder.id)}
                                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs"
                                    >
                                        申请开票
                                    </button>
                                ) : (
                                    <button className="px-3 py-1.5 bg-gray-100 text-gray-400 rounded-lg text-xs">
                                        礼遇券管理
                                    </button>
                                )}
                           </div>
                      </div>
                  </div>
              </div>
          </div>
      )}
      
      {/* Blacklist Modal (Add New) */}
      {showBlacklistModal && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white w-full max-w-sm rounded-xl p-6 shadow-2xl">
                  <div className="text-center mb-4">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">🚫</div>
                      <h3 className="font-bold text-gray-900 text-lg">拉黑该酒店</h3>
                      <p className="text-xs text-gray-500 mt-1">{selectedOrder?.hotelName}</p>
                  </div>
                  
                  <div className="space-y-3">
                      <div>
                          <label className="text-xs font-bold text-gray-700 block mb-1">拉黑/避雷原因</label>
                          <textarea 
                              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none resize-none h-24"
                              placeholder="请详细描述遇到的问题，如：卫生差、乱收费、服务态度恶劣等..."
                              value={blacklistReason}
                              onChange={e => setBlacklistReason(e.target.value)}
                          />
                      </div>
                      <div className="bg-yellow-50 p-3 rounded text-xs text-yellow-800">
                          ⚠️ 拉黑后，系统将在您或团队成员下次搜索该酒店时发出严重警告。
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-6">
                      <button 
                        onClick={() => setShowBlacklistModal(false)}
                        className="py-2.5 bg-gray-100 text-gray-600 font-medium rounded-lg text-sm hover:bg-gray-200"
                      >
                          取消
                      </button>
                      <button 
                        onClick={handleSubmitBlacklist}
                        disabled={!blacklistReason.trim()}
                        className="py-2.5 bg-red-600 text-white font-medium rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                      >
                          确认拉黑
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
