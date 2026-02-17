
import React, { useEffect, useState } from 'react';
import { Sidebar, MENU_ITEMS, UserRole } from './components/Sidebar';
import { Dashboard } from './views/Dashboard';
import { Booking } from './views/Booking';
import { Accounts } from './views/Accounts';
import { PriceMonitor } from './views/PriceMonitor';
import { AIQuote } from './views/AIQuote';
import { Invoices } from './views/Invoices';
import { Orders } from './views/Orders';
import { Blacklist } from './views/Blacklist';
import { Login } from './views/Login';
import { UserManagement } from './views/UserManagement';
import { SystemSettings } from './views/SystemSettings';
import { SystemUser, UserPermissions } from './types';

interface Tab {
  id: string;
  label: string;
}

const App: React.FC = () => {
  const TOKEN_KEY = 'skyhotel_auth_token';

  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('ADMIN');
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);

  const defaultPermissions: UserPermissions = {
    allowNewUserBooking: true,
    newUserLimit: -1,
    newUserQuota: -1,
    allowPlatinumBooking: true,
    platinumLimit: -1,
    platinumQuota: -1,
    allowCorporateBooking: true,
    corporateLimit: -1,
    corporateQuota: -1,
    allowedCorporateNames: [],
    corporateSpecificLimits: {},
    corporateSpecificQuotas: {}
  };

  const mapApiUserToSystemUser = (user: any): SystemUser => ({
    id: user.id,
    username: user.username || user.email || user.id,
    name: user.name || user.display_name || user.username || '未命名用户',
    role: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
    status: user.status === 'DISABLED' ? 'DISABLED' : user.status === 'PENDING' ? 'PENDING' : 'ACTIVE',
    permissions: user.permissions || defaultPermissions,
    createdAt: user.createdAt || user.created_at || new Date().toISOString().slice(0, 10),
    lastLogin: user.lastLogin || user.last_login_at
  });

  // State for multiple tabs
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  
  // Sidebar states
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile toggle
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false); // Desktop toggle

  // --- Auth Handlers ---

  const handleLogin = async (username: string, password: string): Promise<string | null> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: '登录失败' }));
      return data.message || '登录失败';
    }

    const data = await res.json();
    const user = mapApiUserToSystemUser(data.user);
    const role = user.role;

    localStorage.setItem(TOKEN_KEY, data.token);
    setCurrentUser(user);
    setUserRole(role);
    setIsLoggedIn(true);

    if (role === 'ADMIN') {
      setOpenTabs([{ id: 'dashboard', label: '仪表盘' }]);
      setActiveTabId('dashboard');
    } else {
      setOpenTabs([{ id: 'booking', label: '新建预订' }]);
      setActiveTabId('booking');
    }

    return null;
  };

  const handleRegister = async (payload: { username: string; name: string; password: string }): Promise<string | null> => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: '注册失败' }));
      return data.message || '注册失败';
    }

    return null;
  };

  const handleLogout = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_KEY);
    setIsLoggedIn(false);
    setOpenTabs([]);
    setActiveTabId('');
    setCurrentUser(null);
  };

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      return;
    }

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('not logged');
        }
        return res.json();
      })
      .then((data) => {
        const user = mapApiUserToSystemUser(data.user);
        setCurrentUser(user);
        setUserRole(user.role);
        setIsLoggedIn(true);
        if (user.role === 'ADMIN') {
          setOpenTabs([{ id: 'dashboard', label: '仪表盘' }]);
          setActiveTabId('dashboard');
        } else {
          setOpenTabs([{ id: 'booking', label: '新建预订' }]);
          setActiveTabId('booking');
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      });
  }, []);

  // --- Navigation Handlers ---

  const handleMenuClick = (id: string) => {
    // Check permission (client-side simple check)
    // Updated: Added 'settings' to the restricted list for USER
    if (userRole === 'USER' && (id === 'dashboard' || id === 'accounts' || id === 'users' || id === 'settings')) {
        return; // Block access
    }

    // If tab doesn't exist, add it
    if (!openTabs.find(t => t.id === id)) {
      const item = MENU_ITEMS.find(i => i.id === id);
      if (item) {
        setOpenTabs([...openTabs, { id: item.id, label: item.label }]);
      }
    }
    // Switch to it
    setActiveTabId(id);
    setIsSidebarOpen(false); // Close sidebar on mobile
  };

  // Close Tab Logic
  const handleCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); 
    
    const newTabs = openTabs.filter(t => t.id !== id);
    
    if (newTabs.length === 0) {
      // If all tabs closed, revert to default based on role
      const defaultId = userRole === 'ADMIN' ? 'dashboard' : 'booking';
      const defaultLabel = userRole === 'ADMIN' ? '仪表盘' : '新建预订';
      setOpenTabs([{ id: defaultId, label: defaultLabel }]);
      setActiveTabId(defaultId);
      return;
    }

    setOpenTabs(newTabs);

    if (activeTabId === id) {
       const index = openTabs.findIndex(t => t.id === id);
       const nextTab = newTabs[index - 1] || newTabs[index] || newTabs[newTabs.length - 1];
       setActiveTabId(nextTab.id);
    }
  };

  const renderComponent = (id: string) => {
    // Role Guard for rendering
    if (userRole === 'USER') {
        if (id === 'dashboard' || id === 'accounts' || id === 'users' || id === 'settings') {
            return <div className="p-10 text-center text-gray-500">无权访问此页面</div>;
        }
    }

    switch (id) {
      case 'dashboard': return <Dashboard />;
      case 'booking': return <Booking />;
      case 'orders': return <Orders currentUser={currentUser} />;
      case 'accounts': return <Accounts />;
      case 'users': return <UserManagement />;
      case 'monitor': return <PriceMonitor />;
      case 'ai-quote': return <AIQuote />;
      case 'invoices': return <Invoices />;
      case 'blacklist': return <Blacklist />;
      case 'settings': return <SystemSettings />;
      default: return <div className="p-10">页面不存在</div>;
    }
  };

  // --- Render Login View ---
  if (!isLoggedIn) {
      return <Login onLogin={handleLogin} onRegister={handleRegister} />;
  }

  // --- Render Main App ---
  const activeTabLabel = openTabs.find(t => t.id === activeTabId)?.label || 'SkyAgent';

  return (
    <div className="flex bg-gray-50 min-h-screen font-sans text-gray-900 animate-fadeIn overflow-hidden">
      <Sidebar 
        activeTab={activeTabId} 
        onTabChange={handleMenuClick} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        userRole={userRole}
        onLogout={handleLogout}
      />
      
      {/* Mobile Header (Simplified) */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-30 flex items-center px-4 justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h1 className="font-bold text-lg text-gray-800">{activeTabLabel}</h1>
          </div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${userRole === 'ADMIN' ? 'bg-gradient-to-tr from-purple-500 to-blue-500' : 'bg-gray-500'}`}>
              {userRole === 'ADMIN' ? 'A' : 'U'}
          </div>
      </div>

      <main className="flex-1 h-screen flex flex-col overflow-hidden min-w-0">
        {/* Spacer for mobile header */}
        <div className="h-16 md:h-0 flex-shrink-0"></div>
        
        {/* Tab Bar Area (Visible on Desktop) */}
        <div className="hidden md:flex items-center bg-gray-100 border-b border-gray-200 pt-2 px-2 gap-1 overflow-x-auto no-scrollbar flex-shrink-0">
           {openTabs.map(tab => {
             const isActive = activeTabId === tab.id;
             return (
               <div
                 key={tab.id}
                 onClick={() => setActiveTabId(tab.id)}
                 className={`
                    group relative flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium cursor-pointer transition-all select-none min-w-[120px] max-w-[200px] border-t border-x
                    ${isActive 
                      ? 'bg-white text-blue-600 border-gray-200 border-b-white -mb-px z-10' 
                      : 'bg-gray-200 text-gray-500 border-transparent hover:bg-gray-100 hover:text-gray-700'}
                 `}
               >
                 <span className="truncate flex-1">{tab.label}</span>
                 <button 
                    onClick={(e) => handleCloseTab(e, tab.id)}
                    className={`
                      w-5 h-5 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity
                      ${isActive ? 'hover:bg-gray-100 text-gray-400' : 'hover:bg-gray-300 text-gray-500'}
                    `}
                 >
                   ✕
                 </button>
               </div>
             );
           })}
        </div>

        {/* Content Area - Keep Alive Implementation */}
        <div className="flex-1 relative bg-gray-50 overflow-hidden">
            {openTabs.map(tab => (
              <div 
                key={tab.id}
                className="absolute inset-0 w-full h-full overflow-y-auto p-4 md:p-8"
                style={{ 
                  display: activeTabId === tab.id ? 'block' : 'none',
                  zIndex: activeTabId === tab.id ? 10 : 0
                }}
              >
                  <div className="max-w-7xl mx-auto min-h-full">
                    {renderComponent(tab.id)}
                  </div>
              </div>
            ))}
        </div>
      </main>
    </div>
  );
};

export default App;
