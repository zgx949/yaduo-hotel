
import React, { useState, useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { MOCK_SYSTEM_USERS, CORPORATE_COMPANIES } from '../constants';
import { SystemUser, UserPermissions } from '../types';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<SystemUser[]>(MOCK_SYSTEM_USERS);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

  // --- Filter & Search State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // --- Selection & Bulk Action State ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionType, setBulkActionType] = useState<'ENABLE' | 'DISABLE' | null>(null);
  const [bulkTargetPermissions, setBulkTargetPermissions] = useState({
      newUser: true,
      platinum: true,
      corporate: true
  });

  // --- Form State ---
  const [formData, setFormData] = useState<Partial<SystemUser>>({
    username: '',
    name: '',
    role: 'USER',
    status: 'ACTIVE',
    permissions: {
      allowNewUserBooking: true,
      newUserLimit: -1,
      newUserQuota: -1,
      allowPlatinumBooking: false,
      platinumLimit: 0,
      platinumQuota: 0,
      allowCorporateBooking: false,
      corporateLimit: 0,
      corporateQuota: 0,
      allowedCorporateNames: [],
      corporateSpecificLimits: {},
      corporateSpecificQuotas: {}
    }
  });

  // --- Filter Logic ---
  const filteredUsers = useMemo(() => {
      return users.filter(user => {
          const matchSearch = user.name.includes(searchQuery) || user.username.includes(searchQuery);
          const matchRole = roleFilter === 'ALL' || user.role === roleFilter;
          const matchStatus = statusFilter === 'ALL' || user.status === statusFilter;
          return matchSearch && matchRole && matchStatus;
      });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // --- Selection Logic ---
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          setSelectedIds(new Set(filteredUsers.map(u => u.id)));
      } else {
          setSelectedIds(new Set());
      }
  };

  const handleSelectUser = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  // --- CRUD Handlers ---
  const handleEdit = (user: SystemUser) => {
    setEditingUser(user);
    setFormData(JSON.parse(JSON.stringify(user))); // Deep copy
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      name: '',
      role: 'USER',
      status: 'ACTIVE',
      permissions: {
        allowNewUserBooking: true,
        newUserLimit: -1,
        newUserQuota: 0,
        allowPlatinumBooking: false,
        platinumLimit: 0,
        platinumQuota: 0,
        allowCorporateBooking: false,
        corporateLimit: 0,
        corporateQuota: 0,
        allowedCorporateNames: [],
        corporateSpecificLimits: {},
        corporateSpecificQuotas: {}
      }
    });
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username || !formData.name) return;

    if (editingUser) {
        // Update existing
        setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...formData } as SystemUser : u));
    } else {
        // Create new
        const newUser: SystemUser = {
            id: `user-${Date.now()}`,
            createdAt: new Date().toISOString().split('T')[0],
            ...formData as SystemUser
        };
        setUsers([...users, newUser]);
    }
    setShowModal(false);
  };

  const toggleStatus = (id: string) => {
      setUsers(users.map(u => u.id === id ? { ...u, status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' } : u));
  };

  // --- Bulk Action Handlers ---
  const executeBulkAction = () => {
      if (!bulkActionType) return;
      const enable = bulkActionType === 'ENABLE';

      setUsers(prev => prev.map(user => {
          if (!selectedIds.has(user.id)) return user;

          const newPermissions = { ...user.permissions };
          if (bulkTargetPermissions.newUser) newPermissions.allowNewUserBooking = enable;
          if (bulkTargetPermissions.platinum) newPermissions.allowPlatinumBooking = enable;
          if (bulkTargetPermissions.corporate) newPermissions.allowCorporateBooking = enable;

          return { ...user, permissions: newPermissions };
      }));

      setBulkActionType(null);
      setSelectedIds(new Set()); // Clear selection
  };

  // Permission Change Helpers
  const handlePermissionChange = (key: keyof UserPermissions, value: any) => {
      setFormData(prev => ({
          ...prev,
          permissions: {
              ...prev.permissions!,
              [key]: value
          }
      }));
  };

  const handleCorporateSpecificLimitChange = (companyName: string, field: 'limit' | 'quota', value: number) => {
      const fieldKey = field === 'limit' ? 'corporateSpecificLimits' : 'corporateSpecificQuotas';
      setFormData(prev => ({
          ...prev,
          permissions: {
              ...prev.permissions!,
              [fieldKey]: {
                  ...prev.permissions![fieldKey],
                  [companyName]: value
              }
          }
      }));
  };

  const toggleCorporateName = (companyName: string) => {
      const currentList = formData.permissions?.allowedCorporateNames || [];
      const isSelected = currentList.includes(companyName);
      
      let newList;
      let newSpecificLimits = { ...formData.permissions?.corporateSpecificLimits };
      let newSpecificQuotas = { ...formData.permissions?.corporateSpecificQuotas };

      if (isSelected) {
          newList = currentList.filter(c => c !== companyName);
          delete newSpecificLimits[companyName]; 
          delete newSpecificQuotas[companyName]; 
      } else {
          newList = [...currentList, companyName];
          newSpecificLimits[companyName] = -1; 
          newSpecificQuotas[companyName] = -1; 
      }

      setFormData(prev => ({
        ...prev,
        permissions: {
            ...prev.permissions!,
            allowedCorporateNames: newList,
            corporateSpecificLimits: newSpecificLimits,
            corporateSpecificQuotas: newSpecificQuotas
        }
      }));
  };

  // Helper to render limit/quota text
  const renderValueText = (val: number, unit: string = '单') => {
      return val === -1 ? '无限' : `${val}${unit}`;
  };

  return (
    <div className="space-y-6 h-full flex flex-col relative">
       <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">用户权限管理</h2>
            <p className="text-gray-500 text-sm">配置团队成员账号、每日限额及账户余额配额。</p>
        </div>
        <button 
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm flex items-center gap-2"
        >
            <span>+</span> 新增用户
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
              <input 
                  type="text" 
                  placeholder="搜索姓名 / 用户名" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
          </div>
          <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">角色:</span>
              <select 
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="py-2 pl-2 pr-6 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 bg-white"
              >
                  <option value="ALL">全部角色</option>
                  <option value="ADMIN">管理员</option>
                  <option value="USER">普通用户</option>
              </select>
          </div>
          <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">状态:</span>
              <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="py-2 pl-2 pr-6 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 bg-white"
              >
                  <option value="ALL">全部状态</option>
                  <option value="ACTIVE">正常</option>
                  <option value="DISABLED">禁用</option>
              </select>
          </div>
          <div className="w-px h-6 bg-gray-200"></div>
          <div className="text-xs text-gray-400">
              共 {filteredUsers.length} 位用户
          </div>
      </div>

      {/* User Table */}
      <Card className="flex-1 overflow-hidden flex flex-col p-0 pb-16">
          <div className="overflow-auto flex-1">
              <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                      <tr>
                          <th className="px-6 py-3 w-12">
                              <input 
                                  type="checkbox" 
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  checked={selectedIds.size > 0 && selectedIds.size === filteredUsers.length}
                                  onChange={handleSelectAll}
                              />
                          </th>
                          <th className="px-6 py-3 whitespace-nowrap">用户信息</th>
                          <th className="px-6 py-3 whitespace-nowrap">角色</th>
                          <th className="px-6 py-3 whitespace-nowrap">状态</th>
                          <th className="px-6 py-3 whitespace-nowrap">号池权限 (每日限额 / 剩余配额)</th>
                          <th className="px-6 py-3 whitespace-nowrap">企业协议权限</th>
                          <th className="px-6 py-3 whitespace-nowrap text-right">操作</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {filteredUsers.map(user => (
                          <tr key={user.id} className={`hover:bg-gray-50/50 ${selectedIds.has(user.id) ? 'bg-blue-50/30' : ''}`}>
                              <td className="px-6 py-4">
                                  <input 
                                      type="checkbox" 
                                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                      checked={selectedIds.has(user.id)}
                                      onChange={() => handleSelectUser(user.id)}
                                  />
                              </td>
                              <td className="px-6 py-4">
                                  <div className="font-bold text-gray-900">{user.name}</div>
                                  <div className="text-xs text-gray-500">@{user.username}</div>
                              </td>
                              <td className="px-6 py-4">
                                  {user.role === 'ADMIN' ? (
                                      <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-bold">管理员</span>
                                  ) : (
                                      <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium">普通用户</span>
                                  )}
                              </td>
                              <td className="px-6 py-4">
                                  <button 
                                      onClick={() => toggleStatus(user.id)}
                                      className={`px-2 py-1 rounded-full text-xs font-bold transition-colors ${
                                          user.status === 'ACTIVE' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                                      }`}
                                  >
                                      {user.status === 'ACTIVE' ? '正常' : '禁用'}
                                  </button>
                              </td>
                              <td className="px-6 py-4">
                                  <div className="flex flex-col gap-2">
                                      {/* New User */}
                                      <div className={`flex items-center gap-2 ${user.permissions.allowNewUserBooking ? 'text-gray-900' : 'text-gray-400 opacity-50'}`}>
                                          <span className="text-[10px] font-bold border border-current px-1 rounded text-green-700 border-green-200 bg-green-50 w-8 text-center">新客</span>
                                          <div className="flex text-xs gap-3">
                                              <span>日限: <strong>{renderValueText(user.permissions.newUserLimit)}</strong></span>
                                              <span className="text-gray-300">|</span>
                                              <span>余: <strong>{renderValueText(user.permissions.newUserQuota)}</strong></span>
                                          </div>
                                      </div>
                                      {/* Platinum */}
                                      <div className={`flex items-center gap-2 ${user.permissions.allowPlatinumBooking ? 'text-gray-900' : 'text-gray-400 opacity-50'}`}>
                                          <span className="text-[10px] font-bold border border-current px-1 rounded text-amber-700 border-amber-200 bg-amber-50 w-8 text-center">白金</span>
                                          <div className="flex text-xs gap-3">
                                              <span>日限: <strong>{renderValueText(user.permissions.platinumLimit)}</strong></span>
                                              <span className="text-gray-300">|</span>
                                              <span>余: <strong>{renderValueText(user.permissions.platinumQuota)}</strong></span>
                                          </div>
                                      </div>
                                  </div>
                              </td>
                              <td className="px-6 py-4">
                                  {user.permissions.allowCorporateBooking ? (
                                      <div className="max-w-xs space-y-1">
                                          <div className="text-xs text-blue-900 mb-1 flex gap-3">
                                              <span>日限: <strong>{renderValueText(user.permissions.corporateLimit)}</strong></span>
                                              <span className="text-gray-300">|</span>
                                              <span>余: <strong>{renderValueText(user.permissions.corporateQuota)}</strong></span>
                                          </div>
                                          {user.permissions.allowedCorporateNames.length === 0 ? (
                                              <span className="text-xs text-blue-600 bg-blue-50 px-1 py-0.5 rounded">全开放 (所有协议)</span>
                                          ) : (
                                              <div className="flex flex-wrap gap-1">
                                                  {user.permissions.allowedCorporateNames.slice(0, 3).map(name => (
                                                      <span key={name} className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                                                          {name}
                                                      </span>
                                                  ))}
                                                  {user.permissions.allowedCorporateNames.length > 3 && (
                                                      <span className="text-xs text-gray-400">+{user.permissions.allowedCorporateNames.length - 3}</span>
                                                  )}
                                              </div>
                                          )}
                                      </div>
                                  ) : (
                                      <span className="text-xs text-gray-400">无权使用</span>
                                  )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                  <button 
                                    onClick={() => handleEdit(user)}
                                    className="text-blue-600 hover:underline text-xs font-medium"
                                  >
                                      配置/充值
                                  </button>
                              </td>
                          </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                          <tr>
                              <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                                  未找到符合条件的用户
                              </td>
                          </tr>
                      )}
                  </tbody>
              </table>
          </div>
      </Card>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-6 z-30 animate-slideUp">
              <span className="text-sm font-medium whitespace-nowrap">
                  已选择 <span className="text-blue-400 font-bold">{selectedIds.size}</span> 位用户
              </span>
              <div className="h-4 w-px bg-gray-700"></div>
              <div className="flex gap-3">
                  <button 
                    onClick={() => setBulkActionType('ENABLE')}
                    className="text-xs bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded transition-colors font-medium"
                  >
                      批量开启权限
                  </button>
                  <button 
                    onClick={() => setBulkActionType('DISABLE')}
                    className="text-xs bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded transition-colors font-medium"
                  >
                      批量关闭权限
                  </button>
              </div>
              <button 
                onClick={() => setSelectedIds(new Set())}
                className="text-gray-400 hover:text-white ml-2"
              >
                  ✕
              </button>
          </div>
      )}

      {/* Bulk Action Config Modal */}
      {bulkActionType && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                      <h3 className="font-bold text-gray-800">
                          {bulkActionType === 'ENABLE' ? '批量开启权限' : '批量关闭权限'}
                      </h3>
                      <button onClick={() => setBulkActionType(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
                  </div>
                  <div className="p-6 space-y-4">
                      <p className="text-sm text-gray-600">
                          请选择要对选中的 <b>{selectedIds.size}</b> 位用户{bulkActionType === 'ENABLE' ? '开启' : '关闭'}哪些下单权限：
                      </p>
                      
                      <div className="space-y-3">
                          <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                              <input 
                                  type="checkbox" 
                                  className="w-4 h-4 text-blue-600 rounded"
                                  checked={bulkTargetPermissions.newUser}
                                  onChange={e => setBulkTargetPermissions({...bulkTargetPermissions, newUser: e.target.checked})}
                              />
                              <span className="text-sm font-medium text-gray-700">新客首单权限</span>
                          </label>
                          <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                              <input 
                                  type="checkbox" 
                                  className="w-4 h-4 text-blue-600 rounded"
                                  checked={bulkTargetPermissions.platinum}
                                  onChange={e => setBulkTargetPermissions({...bulkTargetPermissions, platinum: e.target.checked})}
                              />
                              <span className="text-sm font-medium text-gray-700">白金会员权限</span>
                          </label>
                          <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                              <input 
                                  type="checkbox" 
                                  className="w-4 h-4 text-blue-600 rounded"
                                  checked={bulkTargetPermissions.corporate}
                                  onChange={e => setBulkTargetPermissions({...bulkTargetPermissions, corporate: e.target.checked})}
                              />
                              <span className="text-sm font-medium text-gray-700">企业协议权限</span>
                          </label>
                      </div>
                  </div>
                  <div className="p-4 border-t border-gray-100 flex gap-3">
                      <button 
                          onClick={() => setBulkActionType(null)}
                          className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                      >
                          取消
                      </button>
                      <button 
                          onClick={executeBulkAction}
                          className={`flex-1 py-2 text-white rounded-lg text-sm font-medium shadow-sm ${
                              bulkActionType === 'ENABLE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                          }`}
                      >
                          确认{bulkActionType === 'ENABLE' ? '开启' : '关闭'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Edit/Add Modal */}
      {showModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-fadeIn">
                  <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <h3 className="font-bold text-gray-800 text-lg">
                          {editingUser ? '用户配置 & 充值' : '新增用户'}
                      </h3>
                      <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                  </div>

                  <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
                      {/* Basic Info */}
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-sm font-bold text-gray-700">真实姓名</label>
                              <input 
                                  required
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                  placeholder="如：张三"
                                  value={formData.name}
                                  onChange={e => setFormData({...formData, name: e.target.value})}
                              />
                          </div>
                          <div className="space-y-1">
                              <label className="text-sm font-bold text-gray-700">登录用户名</label>
                              <input 
                                  required
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                  placeholder="用于系统登录"
                                  value={formData.username}
                                  onChange={e => setFormData({...formData, username: e.target.value})}
                              />
                          </div>
                          <div className="space-y-1">
                              <label className="text-sm font-bold text-gray-700">用户角色</label>
                              <select 
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                  value={formData.role}
                                  onChange={e => setFormData({...formData, role: e.target.value as any})}
                              >
                                  <option value="USER">普通用户 (User)</option>
                                  <option value="ADMIN">管理员 (Admin)</option>
                              </select>
                          </div>
                          <div className="space-y-1">
                              <label className="text-sm font-bold text-gray-700">账号状态</label>
                              <select 
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                  value={formData.status}
                                  onChange={e => setFormData({...formData, status: e.target.value as any})}
                              >
                                  <option value="ACTIVE">正常启用</option>
                                  <option value="DISABLED">禁用账号</option>
                              </select>
                          </div>
                      </div>

                      <hr className="border-gray-100" />

                      {/* Permissions Section */}
                      <div>
                          <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                              <span>🔑 权限与额度配置</span>
                          </h4>
                          <p className="text-xs text-gray-400 mb-4">每日限额控制下单速度，总配额相当于账户余额。数值填 -1 代表无限制。</p>
                          
                          <div className="space-y-4">
                              {/* New User Pool */}
                              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                                  <div className="flex items-center justify-between mb-3">
                                      <span className="text-sm font-bold text-green-800 flex items-center gap-2">
                                          🌱 新客首单权限
                                      </span>
                                      <label className="relative inline-flex items-center cursor-pointer">
                                          <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={formData.permissions?.allowNewUserBooking}
                                            onChange={e => handlePermissionChange('allowNewUserBooking', e.target.checked)}
                                          />
                                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                                      </label>
                                  </div>
                                  
                                  <div className={`grid grid-cols-2 gap-4 transition-opacity ${formData.permissions?.allowNewUserBooking ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                                      <div className="space-y-1">
                                          <label className="text-xs text-gray-500 font-medium">每日限额 (单)</label>
                                          <input 
                                              type="number" 
                                              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-green-500"
                                              placeholder="无限制"
                                              value={formData.permissions?.newUserLimit}
                                              onChange={e => handlePermissionChange('newUserLimit', parseInt(e.target.value) || 0)}
                                          />
                                      </div>
                                      <div className="space-y-1">
                                          <label className="text-xs text-gray-500 font-medium">剩余总配额 (充值)</label>
                                          <input 
                                              type="number" 
                                              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-green-500 font-bold text-gray-700"
                                              placeholder="无限制"
                                              value={formData.permissions?.newUserQuota}
                                              onChange={e => handlePermissionChange('newUserQuota', parseInt(e.target.value) || 0)}
                                          />
                                      </div>
                                  </div>
                              </div>

                              {/* Platinum Pool */}
                              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                                  <div className="flex items-center justify-between mb-3">
                                      <span className="text-sm font-bold text-amber-800 flex items-center gap-2">
                                          👑 白金会员权限
                                      </span>
                                      <label className="relative inline-flex items-center cursor-pointer">
                                          <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={formData.permissions?.allowPlatinumBooking}
                                            onChange={e => handlePermissionChange('allowPlatinumBooking', e.target.checked)}
                                          />
                                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                      </label>
                                  </div>
                                  
                                  <div className={`grid grid-cols-2 gap-4 transition-opacity ${formData.permissions?.allowPlatinumBooking ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                                      <div className="space-y-1">
                                          <label className="text-xs text-gray-500 font-medium">每日限额 (单)</label>
                                          <input 
                                              type="number" 
                                              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-amber-500"
                                              placeholder="无限制"
                                              value={formData.permissions?.platinumLimit}
                                              onChange={e => handlePermissionChange('platinumLimit', parseInt(e.target.value) || 0)}
                                          />
                                      </div>
                                      <div className="space-y-1">
                                          <label className="text-xs text-gray-500 font-medium">剩余总配额 (充值)</label>
                                          <input 
                                              type="number" 
                                              className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-amber-500 font-bold text-gray-700"
                                              placeholder="无限制"
                                              value={formData.permissions?.platinumQuota}
                                              onChange={e => handlePermissionChange('platinumQuota', parseInt(e.target.value) || 0)}
                                          />
                                      </div>
                                  </div>
                              </div>

                              {/* Corporate Section */}
                              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                                  <div className="flex items-center justify-between mb-4">
                                      <div>
                                          <span className="block text-sm font-bold text-gray-900">🏢 企业协议权限</span>
                                      </div>
                                      <label className="relative inline-flex items-center cursor-pointer">
                                          <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={formData.permissions?.allowCorporateBooking}
                                            onChange={e => handlePermissionChange('allowCorporateBooking', e.target.checked)}
                                          />
                                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                      </label>
                                  </div>

                                  {formData.permissions?.allowCorporateBooking && (
                                      <div className="animate-fadeIn space-y-4">
                                          {/* Total Corporate Limit */}
                                          <div className="grid grid-cols-2 gap-4 bg-white/60 p-3 rounded border border-blue-100">
                                              <div className="space-y-1">
                                                  <label className="text-xs text-blue-800 font-bold">每日总限额</label>
                                                  <input 
                                                      type="number" 
                                                      className="w-full border border-blue-200 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
                                                      value={formData.permissions?.corporateLimit}
                                                      onChange={e => handlePermissionChange('corporateLimit', parseInt(e.target.value) || 0)}
                                                  />
                                              </div>
                                              <div className="space-y-1">
                                                  <label className="text-xs text-blue-800 font-bold">企业总配额 (充值)</label>
                                                  <input 
                                                      type="number" 
                                                      className="w-full border border-blue-200 rounded px-2 py-1 text-sm outline-none focus:border-blue-500 font-bold"
                                                      value={formData.permissions?.corporateQuota}
                                                      onChange={e => handlePermissionChange('corporateQuota', parseInt(e.target.value) || 0)}
                                                  />
                                              </div>
                                          </div>

                                          <div>
                                              <p className="text-xs font-bold text-gray-600 mb-2">选择开放企业 (留空全开放):</p>
                                              <div className="flex flex-wrap gap-2 mb-2">
                                                  {CORPORATE_COMPANIES.map(company => {
                                                      const isSelected = formData.permissions?.allowedCorporateNames.includes(company);
                                                      return (
                                                          <button
                                                              key={company}
                                                              type="button"
                                                              onClick={() => toggleCorporateName(company)}
                                                              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                                                                  isSelected 
                                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                                                                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                                                              }`}
                                                          >
                                                              {company}
                                                              {isSelected && <span className="ml-1 font-bold">✓</span>}
                                                          </button>
                                                      );
                                                  })}
                                              </div>
                                              
                                              {/* Specific Limits for Selected Companies */}
                                              {formData.permissions.allowedCorporateNames.length > 0 && (
                                                  <div className="bg-white p-3 rounded-lg border border-gray-100 mt-2 space-y-2">
                                                      <p className="text-[10px] text-gray-400 font-bold mb-1">特定企业独立配置 (覆盖通用):</p>
                                                      <div className="grid grid-cols-7 gap-2 text-[10px] text-gray-400 font-bold mb-1 px-1">
                                                          <div className="col-span-3">企业名称</div>
                                                          <div className="col-span-2 text-center">日限</div>
                                                          <div className="col-span-2 text-center">配额</div>
                                                      </div>
                                                      {formData.permissions.allowedCorporateNames.map(name => (
                                                          <div key={name} className="grid grid-cols-7 gap-2 items-center text-xs">
                                                              <div className="col-span-3 text-gray-700 truncate" title={name}>{name}</div>
                                                              <div className="col-span-2">
                                                                  <input 
                                                                    type="number"
                                                                    className="w-full border border-gray-200 rounded px-1 py-1 text-center outline-none focus:border-blue-500"
                                                                    placeholder="无限"
                                                                    value={formData.permissions?.corporateSpecificLimits[name]}
                                                                    onChange={e => handleCorporateSpecificLimitChange(name, 'limit', parseInt(e.target.value) || 0)}
                                                                  />
                                                              </div>
                                                              <div className="col-span-2">
                                                                  <input 
                                                                    type="number"
                                                                    className="w-full border border-gray-200 rounded px-1 py-1 text-center outline-none focus:border-blue-500 font-bold"
                                                                    placeholder="无限"
                                                                    value={formData.permissions?.corporateSpecificQuotas[name]}
                                                                    onChange={e => handleCorporateSpecificLimitChange(name, 'quota', parseInt(e.target.value) || 0)}
                                                                  />
                                                              </div>
                                                          </div>
                                                      ))}
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>

                  </form>

                  <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                      <button 
                        onClick={() => setShowModal(false)}
                        className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 text-sm"
                      >
                          取消
                      </button>
                      <button 
                        onClick={handleSave}
                        className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-600/20 text-sm"
                      >
                          保存配置
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
