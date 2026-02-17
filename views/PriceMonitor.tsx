
import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { MOCK_MONITORS } from '../constants';
import { PriceMonitorTask } from '../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, LineChart, Line } from 'recharts';

export const PriceMonitor: React.FC = () => {
  const [monitors, setMonitors] = useState<PriceMonitorTask[]>(MOCK_MONITORS);
  const [selectedTask, setSelectedTask] = useState<PriceMonitorTask | null>(null);
  const [showChartModal, setShowChartModal] = useState(false);
  const [chartType, setChartType] = useState<'DAILY' | 'INTRADAY'>('DAILY');
  
  // Add/Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<PriceMonitorTask>>({});

  // Actions
  const handleDelete = (id: string) => {
    if (confirm('确定要删除这条监控任务吗？')) {
      setMonitors(prev => prev.filter(m => m.id !== id));
    }
  };

  const handleEdit = (task: PriceMonitorTask) => {
    setEditingTask(task);
    setShowEditModal(true);
  };

  const handleAdd = () => {
    setEditingTask({
      id: `MON-${Date.now()}`,
      status: 'MONITORING',
      historyDaily: [],
      historyIntraday: [],
      hasInventory: true, // Default assumption
    });
    setShowEditModal(true);
  };

  const handleSave = () => {
    if (!editingTask.hotelName) return;
    
    setMonitors(prev => {
      const exists = prev.find(m => m.id === editingTask.id);
      if (exists) {
        return prev.map(m => m.id === editingTask.id ? { ...m, ...editingTask } as PriceMonitorTask : m);
      } else {
        return [
          {
             ...editingTask, 
             // Mock logic: if target is 0 or low, maybe assume checking inventory? 
             // Just default currentPrice to something higher for demo if not set
             currentPrice: editingTask.currentPrice || (editingTask.targetPrice ? editingTask.targetPrice * 1.1 : 0),
             hasInventory: true,
             historyDaily: [],
             historyIntraday: [],
             lastUpdated: '刚刚'
          } as PriceMonitorTask, 
          ...prev
        ];
      }
    });
    setShowEditModal(false);
  };

  const openChart = (task: PriceMonitorTask) => {
    if (!task.hasInventory) return;
    setSelectedTask(task);
    setChartType('DAILY');
    setShowChartModal(true);
  };

  // Helper to determine display status
  const getTaskStatus = (task: PriceMonitorTask) => {
      if (!task.hasInventory) {
          return {
              badge: '🔔 有房蹲守',
              badgeColor: 'bg-purple-50 text-purple-700 border-purple-100',
              statusText: '当前无房，有房即提醒'
          };
      }
      if (task.currentPrice <= task.targetPrice) {
           return {
              badge: '✅ 已达标',
              badgeColor: 'bg-green-50 text-green-700 border-green-100',
              statusText: '价格已达标'
          };
      }
      return {
          badge: '📉 降价蹲守',
          badgeColor: 'bg-blue-50 text-blue-700 border-blue-100',
          statusText: `目标低于 ¥${task.targetPrice}`
      };
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
       <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">监控/捡漏</h2>
            <p className="text-gray-500 text-sm">自动追踪价格变动与库存释放，全天候为您蹲守。</p>
        </div>
        <button 
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm flex items-center gap-2"
        >
            <span>+</span> 新建监控
        </button>
      </div>

      {/* Main Table */}
      <Card className="flex-1 overflow-hidden flex flex-col p-0">
         <div className="overflow-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3 whitespace-nowrap">监控类型</th>
                  <th className="px-6 py-3 whitespace-nowrap">酒店 / 房型</th>
                  <th className="px-6 py-3 whitespace-nowrap">入离日期</th>
                  <th className="px-6 py-3 whitespace-nowrap">触发条件</th>
                  <th className="px-6 py-3 whitespace-nowrap">当前状态</th>
                  <th className="px-6 py-3 whitespace-nowrap">备注</th>
                  <th className="px-6 py-3 whitespace-nowrap text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monitors.map(task => {
                   const { badge, badgeColor, statusText } = getTaskStatus(task);
                   const isReached = task.currentPrice <= task.targetPrice && task.hasInventory;
                   const diff = task.targetPrice 
                        ? ((task.currentPrice - task.targetPrice) / task.targetPrice) * 100 
                        : 0;

                   return (
                     <tr key={task.id} className="hover:bg-gray-50/50 transition-colors group">
                       <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-md text-xs font-bold border ${badgeColor}`}>
                                {badge}
                            </span>
                       </td>
                       <td className="px-6 py-4">
                         <div className="font-bold text-gray-900">{task.hotelName}</div>
                         <div className="text-xs text-gray-500">{task.roomType}</div>
                       </td>
                       <td className="px-6 py-4">
                         <div className="text-gray-900 font-medium">{task.checkIn}</div>
                         <div className="text-xs text-gray-400">至 {task.checkOut}</div>
                       </td>
                       <td className="px-6 py-4">
                           <div className="text-xs text-gray-600">
                               {statusText}
                           </div>
                       </td>
                       <td className="px-6 py-4">
                         {task.hasInventory ? (
                             <div className="flex items-center gap-3">
                                <div>
                                    <span className={`font-bold text-sm ${isReached ? 'text-green-600' : 'text-red-500'}`}>¥{task.currentPrice}</span>
                                    {isReached && <span className="ml-1 text-[10px] bg-green-100 text-green-700 px-1 rounded">可锁单</span>}
                                </div>
                                {!isReached && (
                                    <div className={`text-[10px] px-1.5 py-0.5 rounded ${diff > 0 ? 'bg-red-50 text-red-500' : 'bg-green-100 text-green-700'}`}>
                                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                    </div>
                                )}
                             </div>
                         ) : (
                             <div className="flex items-center gap-2">
                                 <span className="w-2 h-2 rounded-full bg-gray-300"></span>
                                 <span className="text-gray-400 text-sm">暂时满房</span>
                             </div>
                         )}
                         <div className="text-[10px] text-gray-300 mt-1">更新: {task.lastUpdated}</div>
                       </td>
                       <td className="px-6 py-4 max-w-xs truncate text-gray-500" title={task.note}>
                          {task.note || '-'}
                       </td>
                       <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-3">
                             <button 
                                onClick={() => openChart(task)}
                                disabled={!task.hasInventory}
                                className={`transition-colors ${!task.hasInventory ? 'opacity-30 cursor-not-allowed' : 'text-gray-400 hover:text-blue-600'}`} 
                                title="查看价格走势"
                             >
                                📈
                             </button>
                             <button 
                                onClick={() => handleEdit(task)}
                                className="text-gray-400 hover:text-blue-600 transition-colors"
                                title="编辑"
                             >
                                ✏️
                             </button>
                             <button 
                                onClick={() => handleDelete(task.id)}
                                className="text-gray-400 hover:text-red-600 transition-colors"
                                title="删除"
                             >
                                🗑️
                             </button>
                          </div>
                       </td>
                     </tr>
                   );
                })}
                {monitors.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-gray-400">暂无监控任务，点击右上角添加。</td></tr>
                )}
              </tbody>
            </table>
         </div>
      </Card>

      {/* Edit Modal - Unified Form */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-fadeIn">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                 <h3 className="font-bold text-gray-800">{editingTask.id?.includes('MON-') ? '编辑监控' : '新建监控'}</h3>
                 <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              <div className="p-6 space-y-4">
                 <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700 mb-2">
                     💡 系统会自动识别：若当前无房则蹲守库存；若有房但价格高则蹲守降价。
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500">酒店名称</label>
                        <input 
                            className="w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-blue-500" 
                            value={editingTask.hotelName || ''}
                            onChange={e => setEditingTask({...editingTask, hotelName: e.target.value})}
                            placeholder="如：上海和平饭店"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500">房型关键字</label>
                        <input 
                            className="w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-blue-500" 
                            value={editingTask.roomType || ''}
                            onChange={e => setEditingTask({...editingTask, roomType: e.target.value})}
                            placeholder="如：大床房"
                        />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500">入住日期</label>
                        <input 
                            type="date"
                            className="w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-blue-500" 
                            value={editingTask.checkIn || ''}
                            onChange={e => setEditingTask({...editingTask, checkIn: e.target.value})}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-500">离店日期</label>
                        <input 
                            type="date"
                            className="w-full border-b border-gray-200 py-1 text-sm outline-none focus:border-blue-500" 
                            value={editingTask.checkOut || ''}
                            onChange={e => setEditingTask({...editingTask, checkOut: e.target.value})}
                        />
                    </div>
                 </div>
                 
                 <div className="space-y-1 animate-fadeIn">
                    <label className="text-xs font-bold text-gray-500">目标价格 / 心理价位</label>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400">¥</span>
                        <input 
                            type="number"
                            className="flex-1 border-b border-gray-200 py-1 text-lg font-bold text-blue-600 outline-none focus:border-blue-500" 
                            value={editingTask.targetPrice || ''}
                            onChange={e => setEditingTask({...editingTask, targetPrice: Number(e.target.value)})}
                            placeholder="低于此价或有房提醒"
                        />
                    </div>
                    <p className="text-[10px] text-gray-400">若主要想捡漏有房，价格可填高一点。</p>
                 </div>

                 <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500">备注</label>
                    <textarea 
                        className="w-full border border-gray-200 rounded p-2 text-sm outline-none focus:border-blue-500 resize-none h-20" 
                        value={editingTask.note || ''}
                        onChange={e => setEditingTask({...editingTask, note: e.target.value})}
                        placeholder="选填：客户需求、心理价位等"
                    />
                 </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                 <button onClick={() => setShowEditModal(false)} className="px-4 py-2 bg-white border border-gray-200 rounded text-sm font-medium text-gray-600 hover:bg-gray-100">取消</button>
                 <button onClick={handleSave} className="px-4 py-2 bg-blue-600 rounded text-sm font-medium text-white hover:bg-blue-700 shadow-sm">保存任务</button>
              </div>
           </div>
        </div>
      )}

      {/* Stock-like Chart Modal */}
      {showChartModal && selectedTask && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[600px]">
                {/* Chart Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-start">
                    <div>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-xl font-bold text-gray-900">{selectedTask.hotelName}</h3>
                            <span className="text-sm text-gray-500">{selectedTask.roomType}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                            <div>
                                <span className="text-xs text-gray-400 block">当前价格</span>
                                <span className={`text-2xl font-bold font-mono ${selectedTask.currentPrice <= (selectedTask.targetPrice || 999999) ? 'text-green-600' : 'text-red-500'}`}>
                                    ¥{selectedTask.currentPrice}
                                </span>
                            </div>
                            {selectedTask.targetPrice && (
                                <div>
                                    <span className="text-xs text-gray-400 block">目标价格</span>
                                    <span className="text-lg font-bold font-mono text-gray-600">¥{selectedTask.targetPrice}</span>
                                </div>
                            )}
                            <div className="h-8 w-px bg-gray-200 mx-2"></div>
                            <div>
                                <span className="text-xs text-gray-400 block">更新时间</span>
                                <span className="text-sm font-medium text-gray-600">{selectedTask.lastUpdated}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setShowChartModal(false)} className="bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center text-gray-500">✕</button>
                </div>

                {/* Chart Tabs */}
                <div className="bg-gray-50 px-6 py-2 flex gap-4 border-b border-gray-200">
                    {['INTRADAY', 'DAILY', 'WEEKLY'].map(t => (
                        <button 
                            key={t}
                            onClick={() => setChartType(t as any)}
                            className={`text-sm font-medium px-2 py-1 border-b-2 transition-colors ${
                                chartType === t 
                                ? 'border-blue-600 text-blue-600' 
                                : 'border-transparent text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            {t === 'INTRADAY' ? '分时' : t === 'DAILY' ? '日K' : '周K'}
                        </button>
                    ))}
                </div>

                {/* Chart Area */}
                <div className="flex-1 bg-white relative p-4">
                     <ResponsiveContainer width="100%" height="100%">
                        {chartType === 'DAILY' ? (
                            <AreaChart data={selectedTask.historyDaily} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis 
                                    stroke="#9ca3af" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    domain={['auto', 'auto']}
                                    tickFormatter={(val) => `¥${val}`}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: 'none' }}
                                    formatter={(val: number) => [`¥${val}`, '收盘价']}
                                />
                                {selectedTask.targetPrice && <ReferenceLine y={selectedTask.targetPrice} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '目标价', fill: '#ef4444', fontSize: 12, position: 'right' }} />}
                                <Area type="monotone" dataKey="close" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorClose)" />
                            </AreaChart>
                        ) : (
                            <LineChart data={selectedTask.historyIntraday} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis 
                                    stroke="#9ca3af" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    domain={['auto', 'auto']}
                                    tickFormatter={(val) => `¥${val}`}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: 'none' }}
                                />
                                {selectedTask.targetPrice && <ReferenceLine y={selectedTask.targetPrice} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '目标价', fill: '#ef4444', fontSize: 12, position: 'right' }} />}
                                <Line type="stepAfter" dataKey="price" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                            </LineChart>
                        )}
                     </ResponsiveContainer>
                     
                     {/* Overlay Stats */}
                     <div className="absolute top-4 left-20 bg-white/80 backdrop-blur-sm px-3 py-1 rounded text-xs text-gray-500 pointer-events-none">
                         {chartType === 'DAILY' ? '近7日价格走势' : '今日实时波动'}
                     </div>
                </div>

                {/* Footer Controls */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-between items-center">
                    <div className="text-xs text-gray-500">
                        Tips: 价格数据来源于全网实时比价，每10分钟更新一次。
                    </div>
                    <div className="flex gap-3">
                         <button className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100">
                             🔔 调整提醒
                         </button>
                         <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm">
                             立即锁单
                         </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
