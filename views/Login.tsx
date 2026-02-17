
import React, { useState } from 'react';

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<string | null>;
  onRegister: (payload: { username: string; name: string; password: string }) => Promise<string | null>;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onRegister }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || (mode === 'register' && !name)) {
        setError(mode === 'register' ? '请输入姓名、账号和密码' : '请输入账号和密码');
        return;
    }

    if (mode === 'register' && password !== confirmPassword) {
        setError('两次输入密码不一致');
        return;
    }
    
    setError('');
    setIsLoading(true);

    try {
      const err = mode === 'login'
        ? await onLogin(username, password)
        : await onRegister({ name, username, password });
      setIsLoading(false);
      if (err) {
        setError(err);
      } else if (mode === 'register') {
        setError('注册成功，等待管理员审核后登录');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || '登录失败，请稍后重试');
    }
  };

  const quickLogin = async (name: string) => {
    setUsername(name);
    setPassword('123456');
    setError('');
    setIsLoading(true);
    try {
      const err = await onLogin(name, '123456');
      setIsLoading(false);
      if (err) {
        setError(err);
      }
    } catch (err: any) {
      setIsLoading(false);
      setError(err.message || '登录失败，请稍后重试');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
         <img 
            src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop" 
            alt="Background" 
            className="w-full h-full object-cover opacity-20"
         />
         <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/90 to-slate-900/80"></div>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl w-full max-w-md z-10 animate-fadeIn relative overflow-hidden">
        {/* Top Decorative Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20 transform rotate-3">
            <span className="text-3xl text-white">⚡</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">SkyAgent Pro</h1>
          <p className="text-slate-400 mt-2 text-sm">专业酒店代理预订管理系统</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-8">
            <div className="grid grid-cols-2 gap-2 bg-slate-800/50 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className={`py-2 text-xs rounded-lg transition-colors ${mode === 'login' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); }}
                className={`py-2 text-xs rounded-lg transition-colors ${mode === 'register' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                注册
              </button>
            </div>

            {mode === 'register' && (
              <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300 ml-1">姓名</label>
                  <div className="relative">
                      <span className="absolute left-3 top-3 text-slate-500">👤</span>
                      <input
                          type="text"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          placeholder="请输入真实姓名"
                          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                      />
                  </div>
              </div>
            )}

            <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 ml-1">账号</label>
                <div className="relative">
                    <span className="absolute left-3 top-3 text-slate-500">📧</span>
                    <input 
                        type="text" 
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="请输入用户名 (admin/demo)"
                        className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                    />
                </div>
            </div>
            
            <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 ml-1">密码</label>
                <div className="relative">
                    <span className="absolute left-3 top-3 text-slate-500">🔒</span>
                    <input 
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="请输入密码 (测试可任意)"
                        className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-10 text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none"
                        title={showPassword ? "隐藏密码" : "显示密码"}
                    >
                        {showPassword ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {mode === 'register' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 ml-1">确认密码</label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-slate-500">🔁</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                  />
                </div>
              </div>
            )}

            {error && (
                <div className="text-red-400 text-xs px-2 py-2 bg-red-500/10 rounded-lg border border-red-500/20 text-center animate-pulse flex items-center justify-center gap-2">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {error}
                </div>
            )}

            <button 
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2 mt-2"
            >
                {isLoading ? (
                    <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        登录中...
                    </>
                ) : mode === 'login' ? '安全登录' : '提交注册'}
            </button>
        </form>

        {mode === 'login' && (
          <>
            <div className="flex items-center gap-3 mb-6">
                <div className="h-px bg-slate-700 flex-1"></div>
                <span className="text-xs text-slate-500">测试环境快捷通道</span>
                <div className="h-px bg-slate-700 flex-1"></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
            <button 
                type="button"
                onClick={() => quickLogin('admin')}
                className="group relative flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-blue-500/50 rounded-xl transition-all active:scale-95"
            >
                <div className="w-8 h-8 rounded-full bg-blue-900/50 text-blue-400 flex items-center justify-center mb-2 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    👨‍💻
                </div>
                <span className="text-slate-200 font-medium text-xs">管理员 (Admin)</span>
            </button>

            <button 
                type="button"
                onClick={() => quickLogin('demo')}
                className="group relative flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-purple-500/50 rounded-xl transition-all active:scale-95"
            >
                <div className="w-8 h-8 rounded-full bg-purple-900/50 text-purple-400 flex items-center justify-center mb-2 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    👤
                </div>
                <span className="text-slate-200 font-medium text-xs">普通用户 (User)</span>
            </button>
            </div>
          </>
        )}
          
        <div className="mt-8 text-center">
             <p className="text-[10px] text-slate-600">
                SkyAgent Pro © 2024 · 内部系统禁止外传
             </p>
        </div>
      </div>
    </div>
  );
};
