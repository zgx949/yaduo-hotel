
import React, { useState, useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { MOCK_BLACKLIST } from '../constants';
import { BlacklistRecord } from '../types';

interface AggregatedHotel {
    hotelName: string;
    count: number;
    maxSeverity: 'HIGH' | 'MEDIUM' | 'LOW';
    lastDate: string;
    records: BlacklistRecord[];
    tags: Set<string>;
}

export const Blacklist: React.FC = () => {
  const [query, setQuery] = useState('');
  const [records] = useState<BlacklistRecord[]>(MOCK_BLACKLIST);
  const [selectedHotel, setSelectedHotel] = useState<AggregatedHotel | null>(null);

  // Aggregation Logic
  const aggregatedData = useMemo(() => {
    const map: Record<string, AggregatedHotel> = {};
    const severityWeight = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };

    records.forEach(record => {
        if (!map[record.hotelName]) {
            map[record.hotelName] = {
                hotelName: record.hotelName,
                count: 0,
                maxSeverity: 'LOW',
                lastDate: '',
                records: [],
                tags: new Set()
            };
        }
        
        const hotel = map[record.hotelName];
        hotel.count++;
        hotel.records.push(record);
        record.tags.forEach(t => hotel.tags.add(t));
        
        // Update max severity
        if (severityWeight[record.severity] > severityWeight[hotel.maxSeverity]) {
            hotel.maxSeverity = record.severity;
        }

        // Update latest date
        if (record.date > hotel.lastDate) {
            hotel.lastDate = record.date;
        }
    });

    return Object.values(map).sort((a, b) => {
        // Sort by severity first (desc), then count (desc)
        if (severityWeight[a.maxSeverity] !== severityWeight[b.maxSeverity]) {
            return severityWeight[b.maxSeverity] - severityWeight[a.maxSeverity];
        }
        return b.count - a.count;
    });
  }, [records]);

  // Filter Logic
  const filteredData = aggregatedData.filter(hotel => 
    hotel.hotelName.toLowerCase().includes(query.toLowerCase()) || 
    Array.from(hotel.tags).some(t => t.toLowerCase().includes(query.toLowerCase()))
  );

  // Render Helpers
  const renderSeverityBadge = (severity: string) => {
      switch(severity) {
          case 'HIGH': return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">严重避雷</span>;
          case 'MEDIUM': return <span className="px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-700">体验极差</span>;
          case 'LOW': return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-700">普通吐槽</span>;
          default: return null;
      }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col gap-2">
         <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
             🚫 酒店黑名单
             <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{records.length} 条记录 / 涉及 {aggregatedData.length} 家酒店</span>
         </h2>
         <p className="text-gray-500 text-sm">查询同行避雷记录，避免售后纠纷。</p>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4">
          <div className="flex-1 relative">
             <span className="absolute left-3 top-3 text-gray-400">🔍</span>
             <input 
                type="text" 
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="搜索酒店名称、吐槽标签..."
                value={query}
                onChange={e => setQuery(e.target.value)}
             />
          </div>
          <button className="bg-red-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-red-700 shadow-sm">
              查询
          </button>
      </div>

      {/* Table */}
      <Card className="flex-1 overflow-hidden flex flex-col p-0">
          <div className="overflow-auto flex-1">
              <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                      <tr>
                          <th className="px-6 py-3 whitespace-nowrap">酒店名称</th>
                          <th className="px-6 py-3 whitespace-nowrap text-center">被拉黑/吐槽次数</th>
                          <th className="px-6 py-3 whitespace-nowrap text-center">最高风险等级</th>
                          <th className="px-6 py-3 whitespace-nowrap">涉及标签</th>
                          <th className="px-6 py-3 whitespace-nowrap">最近上报</th>
                          <th className="px-6 py-3 whitespace-nowrap text-right">操作</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {filteredData.map((hotel) => (
                          <tr 
                            key={hotel.hotelName} 
                            className="hover:bg-red-50/30 transition-colors cursor-pointer"
                            onClick={() => setSelectedHotel(hotel)}
                          >
                              <td className="px-6 py-4 font-bold text-gray-800">
                                  {hotel.hotelName}
                              </td>
                              <td className="px-6 py-4 text-center">
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600 font-bold text-xs">
                                      {hotel.count}
                                  </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                  {renderSeverityBadge(hotel.maxSeverity)}
                              </td>
                              <td className="px-6 py-4">
                                  <div className="flex flex-wrap gap-1">
                                      {Array.from(hotel.tags).slice(0, 3).map(tag => (
                                          <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded border border-gray-200">
                                              {tag}
                                          </span>
                                      ))}
                                      {hotel.tags.size > 3 && <span className="text-xs text-gray-400">+{hotel.tags.size - 3}</span>}
                                  </div>
                              </td>
                              <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                                  {hotel.lastDate}
                              </td>
                              <td className="px-6 py-4 text-right">
                                  <button className="text-blue-600 hover:text-blue-800 font-medium text-xs">
                                      查看详情
                                  </button>
                              </td>
                          </tr>
                      ))}
                      {filteredData.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                                未找到相关酒店记录，请尝试其他关键词。
                            </td>
                        </tr>
                      )}
                  </tbody>
              </table>
          </div>
      </Card>

      {/* Detail Modal */}
      {selectedHotel && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedHotel(null)}>
              <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-fadeIn" onClick={e => e.stopPropagation()}>
                   <div className="bg-red-600 text-white px-6 py-4 flex justify-between items-start">
                       <div>
                           <div className="flex items-center gap-2 mb-1">
                               <h3 className="font-bold text-xl">{selectedHotel.hotelName}</h3>
                               <span className="bg-white/20 text-white px-2 py-0.5 rounded text-xs font-mono">
                                   共 {selectedHotel.count} 条记录
                               </span>
                           </div>
                           <p className="text-red-100 text-sm opacity-90">请仔细阅读以下同行反馈，谨慎接单。</p>
                       </div>
                       <button onClick={() => setSelectedHotel(null)} className="text-white/60 hover:text-white text-2xl leading-none">
                           &times;
                       </button>
                   </div>

                   <div className="p-6 overflow-y-auto bg-gray-50 flex-1 space-y-4">
                       {selectedHotel.records.sort((a,b) => b.date.localeCompare(a.date)).map((record) => (
                           <div key={record.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 relative">
                               <div className="flex justify-between items-center mb-2">
                                   <div className="flex items-center gap-2">
                                       {renderSeverityBadge(record.severity)}
                                       <span className="text-xs text-gray-400">ID: {record.id}</span>
                                   </div>
                                   <div className="text-xs text-gray-400 font-mono">
                                       {record.date}
                                   </div>
                               </div>
                               
                               <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700 leading-relaxed mb-3 border border-gray-100">
                                   {record.reason}
                               </div>
                               
                               <div className="flex justify-between items-center">
                                   <div className="flex gap-2">
                                       {record.tags.map(tag => (
                                           <span key={tag} className="text-xs text-gray-500">#{tag}</span>
                                       ))}
                                   </div>
                                   <div className="flex items-center gap-2 text-xs text-gray-500">
                                       <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-600">
                                           {record.reportedBy.charAt(0).toUpperCase()}
                                       </span>
                                       <span>{record.reportedBy}</span>
                                   </div>
                               </div>
                           </div>
                       ))}
                   </div>
                   
                   <div className="bg-white border-t border-gray-100 p-4 text-center">
                        <button 
                            onClick={() => setSelectedHotel(null)}
                            className="bg-gray-100 text-gray-600 px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
                        >
                            关闭
                        </button>
                   </div>
              </div>
          </div>
      )}
    </div>
  );
};
