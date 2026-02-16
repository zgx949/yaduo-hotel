
import React, { useState } from 'react';
import { Card } from '../components/ui/Card';
import { MOCK_SYSTEM_CONFIG } from '../constants';
import { SystemConfig } from '../types';

export const SystemSettings: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig>(MOCK_SYSTEM_CONFIG);
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'CHANNELS' | 'PROXIES' | 'AI'>('GENERAL');
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED'>('IDLE');

  // Input states for new items
  const [newCorporateBan, setNewCorporateBan] = useState('');
  const [newProxy, setNewProxy] = useState({ ip: '', port: '', type: 'DYNAMIC' });

  const handleSave = () => {
    setSaveStatus('SAVING');
    setTimeout(() => {
      setSaveStatus('SAVED');
      setTimeout(() => setSaveStatus('IDLE'), 2000);
    }, 1000);
  };

  const handleToggleChannel = (key: keyof typeof config.channels) => {
    setConfig(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        [key]: !prev.channels[key]
      }
    }));
  };

  const addCorporateBan = () => {
    if (!newCorporateBan.trim()) return;
    setConfig(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        disabledCorporateNames: [...prev.channels.disabledCorporateNames, newCorporateBan.trim()]
      }
    }));
    setNewCorporateBan('');
  };

  const removeCorporateBan = (name: string) => {
    setConfig(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        disabledCorporateNames: prev.channels.disabledCorporateNames.filter(c => c !== name)
      }
    }));
  };

  const addProxy = () => {
    if (!newProxy.ip || !newProxy.port) return;
    const newNode: any = {
      id: `p-${Date.now()}`,
      ip: newProxy.ip,
      port: parseInt(newProxy.port),
      type: newProxy.type,
      status: 'ONLINE', // Mock
      lastChecked: '刚刚',
      location: '未知'
    };
    setConfig(prev => ({
      ...prev,
      proxies: [newNode, ...prev.proxies]
    }));
    setNewProxy({ ip: '', port: '', type: 'DYNAMIC' });
  };

  const deleteProxy = (id: string) => {
    setConfig(prev => ({
      ...prev,
      proxies: prev.proxies.filter(p => p.id !== id)
    }));
  };

  const renderGeneralTab = () => (
    <div className="space-y-6">
      <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-lg">
        <div className="flex justify-between items-center">
          <div className="flex gap-3">
            <span className="text-2xl">🚧</span>
            <div>
              <h3 className="font-bold text-orange-800">网站维护模式</h3>
              <p className="text-sm text-orange-700 mt-1">开启后，除管理员外所有用户将无法登录或下单。</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer" 
              checked={config.maintenanceMode}
              onChange={e => setConfig({ ...config, maintenanceMode: e.target.checked })}
            />
            <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-orange-600"></div>
          </label>
        </div>
        {config.maintenanceMode && (
          <div className="mt-4">
            <label className="text-xs font-bold text-orange-800 block mb-1">维护公告内容</label>
            <input 
              type="text" 
              value={config.maintenanceMessage}
              onChange={e => setConfig({ ...config, maintenanceMessage: e.target.value })}
              className="w-full border border-orange-200 rounded px-3 py-2 text-sm outline-none focus:border-orange-500 bg-white"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <Card title="基础信息">
            <div className="space-y-4">
               <div>
                  <label className="block text-sm font-medium text-gray-700">系统名称</label>
                  <input type="text" defaultValue="SkyHotel Agent Pro" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700">客服联系方式</label>
                  <input type="text" defaultValue="400-888-9999" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
               </div>
            </div>
         </Card>
         <Card title="安全设置">
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">强制 HTTPS</span>
                  <div className="w-10 h-5 bg-green-500 rounded-full relative cursor-pointer"><div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5"></div></div>
               </div>
               <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">API 访问日志记录</span>
                  <div className="w-10 h-5 bg-green-500 rounded-full relative cursor-pointer"><div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5"></div></div>
               </div>
            </div>
         </Card>
      </div>
    </div>
  );

  const renderChannelsTab = () => (
    <div className="space-y-6">
      <Card title="全局下单渠道开关" className="border-t-4 border-t-blue-500">
        <p className="text-sm text-gray-500 mb-4 bg-gray-50 p-3 rounded">
          ⚠️ 注意：此处为全局总开关。如果关闭，即使个别用户拥有权限也无法下单。
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <span className="text-xl">🌱</span>
              <div>
                <h4 className="font-bold text-gray-800">新客首单渠道</h4>
                <p className="text-xs text-gray-500">New User Booking</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={config.channels.enableNewUser}
                onChange={() => handleToggleChannel('enableNewUser')}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <span className="text-xl">👑</span>
              <div>
                <h4 className="font-bold text-gray-800">白金会员渠道</h4>
                <p className="text-xs text-gray-500">Platinum Booking</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={config.channels.enablePlatinum}
                onChange={() => handleToggleChannel('enablePlatinum')}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <span className="text-xl">🏢</span>
              <div>
                <h4 className="font-bold text-gray-800">企业协议渠道</h4>
                <p className="text-xs text-gray-500">Corporate Booking</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={config.channels.enableCorporate}
                onChange={() => handleToggleChannel('enableCorporate')}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </Card>

      <Card title="特定协议黑名单">
        <p className="text-sm text-gray-500 mb-3">
          禁止以下企业名称的协议被使用（即时生效，防止风控）。
        </p>
        <div className="flex gap-2 mb-4">
          <input 
            type="text" 
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="输入企业名称..."
            value={newCorporateBan}
            onChange={e => setNewCorporateBan(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCorporateBan()}
          />
          <button 
            onClick={addCorporateBan}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
          >
            添加禁用
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.channels.disabledCorporateNames.map(name => (
            <span key={name} className="bg-red-50 text-red-700 border border-red-100 px-3 py-1 rounded-full text-sm flex items-center gap-2">
              {name}
              <button 
                onClick={() => removeCorporateBan(name)}
                className="hover:text-red-900 font-bold"
              >
                &times;
              </button>
            </span>
          ))}
          {config.channels.disabledCorporateNames.length === 0 && (
            <span className="text-gray-400 text-sm italic">当前无禁用协议</span>
          )}
        </div>
      </Card>
    </div>
  );

  const renderProxiesTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
         <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
             <div className="px-4 py-1.5 bg-white shadow-sm rounded-md text-sm font-bold text-gray-800">全部 ({config.proxies.length})</div>
             <div className="px-4 py-1.5 text-sm text-gray-500">在线 ({config.proxies.filter(p => p.status === 'ONLINE').length})</div>
         </div>
         <div className="flex gap-2">
             <input 
                placeholder="IP 地址" 
                className="w-32 border border-gray-200 rounded px-2 text-sm" 
                value={newProxy.ip} onChange={e => setNewProxy({...newProxy, ip: e.target.value})}
             />
             <input 
                placeholder="端口" 
                className="w-20 border border-gray-200 rounded px-2 text-sm" 
                value={newProxy.port} onChange={e => setNewProxy({...newProxy, port: e.target.value})}
             />
             <select 
                className="border border-gray-200 rounded px-2 text-sm bg-white"
                value={newProxy.type} onChange={e => setNewProxy({...newProxy, type: e.target.value as any})}
             >
                 <option value="DYNAMIC">动态</option>
                 <option value="STATIC">静态</option>
             </select>
             <button onClick={addProxy} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">+ 添加</button>
         </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium">
                  <tr>
                      <th className="px-6 py-3">状态</th>
                      <th className="px-6 py-3">IP 地址 : 端口</th>
                      <th className="px-6 py-3">类型</th>
                      <th className="px-6 py-3">归属地</th>
                      <th className="px-6 py-3">最后检测</th>
                      <th className="px-6 py-3 text-right">操作</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                  {config.proxies.map(proxy => (
                      <tr key={proxy.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                              {proxy.status === 'ONLINE' ? (
                                  <span className="flex items-center gap-1.5 text-green-600 text-xs font-bold bg-green-50 px-2 py-0.5 rounded-full w-fit">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> 在线
                                  </span>
                              ) : (
                                  <span className="flex items-center gap-1.5 text-red-600 text-xs font-bold bg-red-50 px-2 py-0.5 rounded-full w-fit">
                                      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> 离线
                                  </span>
                              )}
                          </td>
                          <td className="px-6 py-4 font-mono text-gray-700">
                              {proxy.ip}:{proxy.port}
                          </td>
                          <td className="px-6 py-4">
                              <span className={`text-xs px-2 py-0.5 rounded border ${proxy.type === 'DYNAMIC' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                  {proxy.type === 'DYNAMIC' ? '动态轮换' : '静态固定'}
                              </span>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{proxy.location}</td>
                          <td className="px-6 py-4 text-gray-400 text-xs">{proxy.lastChecked}</td>
                          <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => deleteProxy(proxy.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded text-xs transition-colors"
                              >
                                  删除
                              </button>
                          </td>
                      </tr>
                  ))}
              </tbody>
          </table>
      </div>
    </div>
  );

  const renderAITab = () => (
    <div className="space-y-6">
       <div className="grid grid-cols-1 gap-6">
           {config.llmModels.map((model, index) => (
               <Card key={model.id} className={model.isActive ? 'border-l-4 border-l-blue-500' : 'opacity-70 grayscale'}>
                   <div className="flex justify-between items-start mb-4">
                       <div className="flex items-center gap-3">
                           <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${model.provider === 'GEMINI' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                               {model.provider === 'GEMINI' ? '✨' : '🤖'}
                           </div>
                           <div>
                               <h3 className="font-bold text-gray-800">{model.name}</h3>
                               <p className="text-xs text-gray-500">{model.provider} / {model.modelId}</p>
                           </div>
                       </div>
                       <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={model.isActive}
                            onChange={() => {
                                const newModels = [...config.llmModels];
                                newModels[index].isActive = !newModels[index].isActive;
                                setConfig({...config, llmModels: newModels});
                            }}
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                       </label>
                   </div>

                   <div className="space-y-3">
                       <div>
                           <label className="block text-xs font-bold text-gray-500 mb-1">API Key</label>
                           <div className="flex gap-2">
                               <input 
                                  type="password" 
                                  defaultValue={model.apiKey} 
                                  className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm bg-gray-50 font-mono"
                                  readOnly={!model.isActive}
                               />
                               <button className="text-blue-600 text-xs whitespace-nowrap hover:underline">显示</button>
                           </div>
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-500 mb-1">System Prompt (系统提示词)</label>
                           <textarea 
                              className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-gray-50 min-h-[80px] resize-none"
                              defaultValue={model.systemPrompt}
                              readOnly={!model.isActive}
                           />
                       </div>
                   </div>
               </Card>
           ))}
       </div>
       
       <button className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 font-bold hover:border-blue-400 hover:text-blue-500 transition-colors">
           + 添加新模型配置
       </button>
    </div>
  );

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">系统管理</h2>
            <p className="text-gray-500 text-sm">全局配置、渠道风控及基础设施管理。</p>
        </div>
        <div className="flex gap-3">
            {saveStatus === 'SAVING' && <span className="text-sm text-gray-500 self-center">保存中...</span>}
            {saveStatus === 'SAVED' && <span className="text-sm text-green-600 self-center font-bold">✓ 已保存</span>}
            <button 
              onClick={handleSave}
              className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 shadow-lg"
            >
                保存配置
            </button>
        </div>
      </div>

      <div className="flex gap-6 border-b border-gray-200">
          {[
              { id: 'GENERAL', label: '基础设置', icon: '⚙️' },
              { id: 'CHANNELS', label: '渠道控制', icon: '🛡️' },
              { id: 'PROXIES', label: '代理池管理', icon: '🌐' },
              { id: 'AI', label: '大模型配置', icon: '🧠' },
          ].map(tab => (
              <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`pb-3 px-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                      activeTab === tab.id 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
              >
                  <span>{tab.icon}</span> {tab.label}
              </button>
          ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-10">
          <div className="max-w-4xl">
              {activeTab === 'GENERAL' && renderGeneralTab()}
              {activeTab === 'CHANNELS' && renderChannelsTab()}
              {activeTab === 'PROXIES' && renderProxiesTab()}
              {activeTab === 'AI' && renderAITab()}
          </div>
      </div>
    </div>
  );
};
