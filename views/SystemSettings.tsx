import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { MOCK_SYSTEM_CONFIG } from '../constants';
import { LLMConfig, ProxyNode, SystemConfig } from '../types';

type SettingsTab = 'GENERAL' | 'CHANNELS' | 'PROXIES' | 'AI';

const TOKEN_KEY = 'skyhotel_auth_token';

const createEmptyModel = (): LLMConfig => ({
  id: `llm-${Date.now()}`,
  name: '',
  provider: 'OPENAI',
  modelId: '',
  apiKey: '',
  systemPrompt: '',
  baseUrl: '',
  temperature: 0.2,
  maxTokens: 1024,
  isActive: false
});

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const SystemSettings: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig>(MOCK_SYSTEM_CONFIG);
  const [activeTab, setActiveTab] = useState<SettingsTab>('GENERAL');
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED'>('IDLE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newCorporateBan, setNewCorporateBan] = useState('');
  const [newProxy, setNewProxy] = useState({ ip: '', port: '', type: 'DYNAMIC' as 'DYNAMIC' | 'STATIC' });
  const [llmPrompt, setLlmPrompt] = useState('请用一句话给出今天酒店代理下单的风控建议');
  const [llmOutput, setLlmOutput] = useState('');
  const [llmTesting, setLlmTesting] = useState(false);

  const fetchWithAuth = async (url: string, options?: RequestInit) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      throw new Error('登录已过期，请重新登录');
    }
    const headers = new Headers(options?.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (options?.body && !headers.get('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || '请求失败');
    }
    if (res.status === 204) {
      return null;
    }
    return res.json();
  };

  const loadConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWithAuth('/api/system/config');
      setConfig(data);
    } catch (err) {
      setConfig(MOCK_SYSTEM_CONFIG);
      setError(getErrorMessage(err, '加载系统配置失败，已回退本地数据'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async () => {
    setSaveStatus('SAVING');
    setError('');
    try {
      const saved = await fetchWithAuth('/api/system/config', {
        method: 'PUT',
        body: JSON.stringify(config)
      });
      setConfig(saved);
      setSaveStatus('SAVED');
      setTimeout(() => setSaveStatus('IDLE'), 2000);
    } catch (err) {
      setSaveStatus('IDLE');
      setError(getErrorMessage(err, '保存失败'));
    }
  };

  const handleToggleChannel = (key: 'enableNewUser' | 'enablePlatinum' | 'enableCorporate') => {
    setConfig((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [key]: !prev.channels[key]
      }
    }));
  };

  const addCorporateBan = () => {
    const value = newCorporateBan.trim();
    if (!value || config.channels.disabledCorporateNames.includes(value)) return;
    setConfig((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        disabledCorporateNames: [...prev.channels.disabledCorporateNames, value]
      }
    }));
    setNewCorporateBan('');
  };

  const removeCorporateBan = (name: string) => {
    setConfig((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        disabledCorporateNames: prev.channels.disabledCorporateNames.filter((it) => it !== name)
      }
    }));
  };

  const addProxy = async () => {
    if (!newProxy.ip || !newProxy.port) return;
    try {
      const created = await fetchWithAuth('/api/system/proxies', {
        method: 'POST',
        body: JSON.stringify({
          ip: newProxy.ip,
          port: Number(newProxy.port),
          type: newProxy.type,
          status: 'ONLINE'
        })
      });
      setConfig((prev) => ({ ...prev, proxies: [created, ...prev.proxies] }));
      setNewProxy({ ip: '', port: '', type: 'DYNAMIC' });
    } catch (err) {
      setError(getErrorMessage(err, '新增代理失败'));
    }
  };

  const deleteProxy = async (id: string) => {
    try {
      await fetchWithAuth(`/api/system/proxies/${id}`, { method: 'DELETE' });
      setConfig((prev) => ({ ...prev, proxies: prev.proxies.filter((p) => p.id !== id) }));
    } catch (err) {
      setError(getErrorMessage(err, '删除代理失败'));
    }
  };

  const checkProxy = async (id: string) => {
    try {
      const checked = await fetchWithAuth(`/api/system/proxies/${id}/check`, { method: 'POST' });
      setConfig((prev) => ({
        ...prev,
        proxies: prev.proxies.map((it) => (it.id === id ? { ...it, ...checked } : it))
      }));
    } catch (err) {
      setError(getErrorMessage(err, '代理检测失败'));
    }
  };

  const updateModel = (index: number, patch: Partial<LLMConfig>) => {
    setConfig((prev) => {
      const llmModels = [...prev.llmModels];
      llmModels[index] = { ...llmModels[index], ...patch };
      return { ...prev, llmModels };
    });
  };

  const addModel = () => {
    setConfig((prev) => ({ ...prev, llmModels: [...prev.llmModels, createEmptyModel()] }));
  };

  const removeModel = (id: string) => {
    setConfig((prev) => ({ ...prev, llmModels: prev.llmModels.filter((it) => it.id !== id) }));
  };

  const testActiveModel = async () => {
    setLlmTesting(true);
    setLlmOutput('');
    try {
      const model = config.llmModels.find((it) => it.isActive);
      const data = await fetchWithAuth('/api/system/llm/test', {
        method: 'POST',
        body: JSON.stringify({
          prompt: llmPrompt,
          modelId: model?.id
        })
      });
      setLlmOutput(data.output || '');
    } catch (err) {
      setLlmOutput(getErrorMessage(err, '模型测试失败'));
    } finally {
      setLlmTesting(false);
    }
  };

  const proxyStats = useMemo(
    () => ({
      total: config.proxies.length,
      online: config.proxies.filter((p) => p.status === 'ONLINE').length,
      offline: config.proxies.filter((p) => p.status === 'OFFLINE').length
    }),
    [config.proxies]
  );

  const renderGeneralTab = () => (
    <div className="space-y-6">
      <Card title="基础信息">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500">系统名称</label>
            <input
              value={config.siteName}
              onChange={(e) => setConfig((prev) => ({ ...prev, siteName: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">客服联系方式</label>
            <input
              value={config.supportContact}
              onChange={(e) => setConfig((prev) => ({ ...prev, supportContact: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
      </Card>

      <Card title="维护模式">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={config.maintenanceMode}
              onChange={(e) => setConfig((prev) => ({ ...prev, maintenanceMode: e.target.checked }))}
            />
            开启网站维护模式
          </label>
          <textarea
            value={config.maintenanceMessage}
            onChange={(e) => setConfig((prev) => ({ ...prev, maintenanceMessage: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[88px]"
            placeholder="维护公告内容"
          />
        </div>
      </Card>
    </div>
  );

  const renderChannelsTab = () => (
    <div className="space-y-6">
      <Card title="下单渠道总开关">
        <div className="space-y-3 text-sm">
          <label className="flex items-center justify-between"><span>新客首单</span><input type="checkbox" checked={config.channels.enableNewUser} onChange={() => handleToggleChannel('enableNewUser')} /></label>
          <label className="flex items-center justify-between"><span>白金会员</span><input type="checkbox" checked={config.channels.enablePlatinum} onChange={() => handleToggleChannel('enablePlatinum')} /></label>
          <label className="flex items-center justify-between"><span>企业协议</span><input type="checkbox" checked={config.channels.enableCorporate} onChange={() => handleToggleChannel('enableCorporate')} /></label>
        </div>
      </Card>

      <Card title="企业协议黑名单">
        <div className="flex gap-2 mb-3">
          <input
            value={newCorporateBan}
            onChange={(e) => setNewCorporateBan(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCorporateBan()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="输入企业名称"
          />
          <button onClick={addCorporateBan} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">添加</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.channels.disabledCorporateNames.map((name) => (
            <span key={name} className="bg-red-50 text-red-700 border border-red-100 px-3 py-1 rounded-full text-sm flex items-center gap-2">
              {name}
              <button onClick={() => removeCorporateBan(name)}>&times;</button>
            </span>
          ))}
          {config.channels.disabledCorporateNames.length === 0 && <span className="text-gray-400 text-sm">当前无禁用协议</span>}
        </div>
      </Card>
    </div>
  );

  const renderProxiesTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Card><div className="text-xs text-gray-500">全部节点</div><div className="text-xl font-bold">{proxyStats.total}</div></Card>
        <Card><div className="text-xs text-gray-500">在线节点</div><div className="text-xl font-bold text-green-600">{proxyStats.online}</div></Card>
        <Card><div className="text-xs text-gray-500">离线节点</div><div className="text-xl font-bold text-red-600">{proxyStats.offline}</div></Card>
      </div>

      <Card title="新增代理节点">
        <div className="flex flex-wrap gap-2">
          <input placeholder="IP" value={newProxy.ip} onChange={(e) => setNewProxy((prev) => ({ ...prev, ip: e.target.value }))} className="w-40 border border-gray-200 rounded px-2 py-2 text-sm" />
          <input placeholder="端口" value={newProxy.port} onChange={(e) => setNewProxy((prev) => ({ ...prev, port: e.target.value }))} className="w-28 border border-gray-200 rounded px-2 py-2 text-sm" />
          <select value={newProxy.type} onChange={(e) => setNewProxy((prev) => ({ ...prev, type: e.target.value as 'DYNAMIC' | 'STATIC' }))} className="border border-gray-200 rounded px-2 py-2 text-sm bg-white">
            <option value="DYNAMIC">动态</option>
            <option value="STATIC">静态</option>
          </select>
          <button onClick={addProxy} className="px-3 py-2 bg-green-600 text-white rounded text-sm">+ 添加</button>
        </div>
      </Card>

      <Card title="代理池列表">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left py-2">状态</th>
                <th className="text-left py-2">地址</th>
                <th className="text-left py-2">类型</th>
                <th className="text-left py-2">失败数</th>
                <th className="text-left py-2">最后检测</th>
                <th className="text-right py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {config.proxies.map((proxy: ProxyNode) => (
                <tr key={proxy.id} className="border-t border-gray-100">
                  <td className="py-2">{proxy.status === 'ONLINE' ? '在线' : proxy.status === 'OFFLINE' ? '离线' : '高延迟'}</td>
                  <td className="py-2 font-mono">{proxy.ip}:{proxy.port}</td>
                  <td className="py-2">{proxy.type}</td>
                  <td className="py-2">{proxy.failCount || 0}</td>
                  <td className="py-2 text-xs text-gray-500">{proxy.lastChecked}</td>
                  <td className="py-2 text-right space-x-2">
                    <button onClick={() => checkProxy(proxy.id)} className="text-blue-600 text-xs">检测</button>
                    <button onClick={() => deleteProxy(proxy.id)} className="text-red-600 text-xs">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );

  const renderAITab = () => (
    <div className="space-y-6">
      <Card title="模型列表（LangChain 托管）">
        <div className="space-y-4">
          {config.llmModels.map((model, index) => (
            <div key={model.id} className="border border-gray-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{model.name || `模型 ${index + 1}`}</div>
                <label className="text-xs flex items-center gap-2">
                  <input type="checkbox" checked={model.isActive} onChange={(e) => updateModel(index, { isActive: e.target.checked })} />
                  启用
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={model.name} onChange={(e) => updateModel(index, { name: e.target.value })} className="border border-gray-200 rounded px-2 py-2 text-sm" placeholder="模型名称" />
                <select value={model.provider} onChange={(e) => updateModel(index, { provider: e.target.value as LLMConfig['provider'] })} className="border border-gray-200 rounded px-2 py-2 text-sm bg-white">
                  <option value="OPENAI">OPENAI</option>
                  <option value="GEMINI">GEMINI</option>
                  <option value="CLAUDE">CLAUDE</option>
                </select>
                <input value={model.modelId} onChange={(e) => updateModel(index, { modelId: e.target.value })} className="border border-gray-200 rounded px-2 py-2 text-sm" placeholder="modelId" />
                <input value={model.baseUrl || ''} onChange={(e) => updateModel(index, { baseUrl: e.target.value })} className="border border-gray-200 rounded px-2 py-2 text-sm" placeholder="baseUrl（可选）" />
                <input value={model.apiKey} onChange={(e) => updateModel(index, { apiKey: e.target.value })} className="border border-gray-200 rounded px-2 py-2 text-sm font-mono md:col-span-2" placeholder="API Key（支持留空走后端环境变量）" />
                <input type="number" value={model.temperature ?? 0.2} onChange={(e) => updateModel(index, { temperature: Number(e.target.value) })} className="border border-gray-200 rounded px-2 py-2 text-sm" placeholder="temperature" />
                <input type="number" value={model.maxTokens ?? 1024} onChange={(e) => updateModel(index, { maxTokens: Number(e.target.value) })} className="border border-gray-200 rounded px-2 py-2 text-sm" placeholder="maxTokens" />
                <textarea value={model.systemPrompt || ''} onChange={(e) => updateModel(index, { systemPrompt: e.target.value })} className="border border-gray-200 rounded px-2 py-2 text-sm min-h-[72px] md:col-span-2" placeholder="System Prompt" />
              </div>
              <div className="text-right">
                <button onClick={() => removeModel(model.id)} className="text-xs text-red-600">删除模型</button>
              </div>
            </div>
          ))}
          <button onClick={addModel} className="w-full py-2 border border-dashed border-gray-300 rounded text-sm text-gray-500 hover:text-blue-600 hover:border-blue-400">+ 添加模型</button>
        </div>
      </Card>

      <Card title="在线测试">
        <div className="space-y-3">
          <textarea value={llmPrompt} onChange={(e) => setLlmPrompt(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm min-h-[80px]" />
          <button onClick={testActiveModel} disabled={llmTesting} className="px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
            {llmTesting ? '测试中...' : '测试当前启用模型'}
          </button>
          {llmOutput && <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs whitespace-pre-wrap">{llmOutput}</pre>}
        </div>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">系统管理</h2>
          <p className="text-gray-500 text-sm">全局配置、渠道风控、代理池和大模型接入。</p>
        </div>
        <div className="flex gap-3">
          {saveStatus === 'SAVING' && <span className="text-sm text-gray-500 self-center">保存中...</span>}
          {saveStatus === 'SAVED' && <span className="text-sm text-green-600 self-center font-bold">✓ 已保存</span>}
          <button onClick={loadConfig} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">刷新</button>
          <button onClick={handleSave} className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 shadow-lg">
            保存配置
          </button>
        </div>
      </div>

      {(loading || error) && (
        <div className="space-y-2">
          {loading && <div className="text-xs text-gray-500">配置加载中...</div>}
          {error && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">{error}</div>}
        </div>
      )}

      <div className="flex gap-6 border-b border-gray-200">
        {[
          { id: 'GENERAL', label: '基础设置', icon: '⚙️' },
          { id: 'CHANNELS', label: '渠道控制', icon: '🛡️' },
          { id: 'PROXIES', label: '代理池管理', icon: '🌐' },
          { id: 'AI', label: '大模型配置', icon: '🧠' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SettingsTab)}
            className={`pb-3 px-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-10">
        <div className="max-w-5xl">
          {activeTab === 'GENERAL' && renderGeneralTab()}
          {activeTab === 'CHANNELS' && renderChannelsTab()}
          {activeTab === 'PROXIES' && renderProxiesTab()}
          {activeTab === 'AI' && renderAITab()}
        </div>
      </div>
    </div>
  );
};
