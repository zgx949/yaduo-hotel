import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../components/ui/Card';
import { generateQuoteFromInput } from '../services/geminiService';
import { QuoteTask, AIQuoteResponse } from '../types';

const DEFAULT_TEMPLATE = `【酒店报价单】
🏨 酒店：{hotelName}
📍 位置：{location}
📅 日期：{dates}
🛏️ 房型：{roomType}
🍳 早餐：{breakfast}
📜 政策：{cancellationPolicy}
💰 价格：{estimatedPrice}

💡 推荐理由：
{recommendation}`;

export const AIQuote: React.FC = () => {
  const [tasks, setTasks] = useState<QuoteTask[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [outputTemplate, setOutputTemplate] = useState(DEFAULT_TEMPLATE);

  // Simulated Async Worker
  useEffect(() => {
    const processQueue = async () => {
      const pendingTask = tasks.find(t => t.status === 'PENDING');
      if (!pendingTask) return;

      setTasks(prev => prev.map(t => t.id === pendingTask.id ? { ...t, status: 'PROCESSING' } : t));

      try {
        const result = await generateQuoteFromInput({
            text: pendingTask.inputText,
            imageBase64: pendingTask.inputImage,
            mimeType: pendingTask.inputImage ? 'image/jpeg' : undefined,
            customInstructions: pendingTask.customInstructions
        });

        if (result) {
          setTasks(prev => prev.map(t => t.id === pendingTask.id ? { ...t, status: 'COMPLETED', result } : t));
        } else {
          setTasks(prev => prev.map(t => t.id === pendingTask.id ? { ...t, status: 'FAILED', error: 'Generation failed' } : t));
        }
      } catch (e) {
        setTasks(prev => prev.map(t => t.id === pendingTask.id ? { ...t, status: 'FAILED', error: 'Network error' } : t));
      }
    };

    if (tasks.some(t => t.status === 'PENDING')) {
        const timer = setTimeout(processQueue, 1000);
        return () => clearTimeout(timer);
    }
  }, [tasks]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setImageMimeType(file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddTask = () => {
    if (!inputText && !selectedImage) return;

    const newTask: QuoteTask = {
      id: `TASK-${Date.now()}`,
      type: selectedImage ? 'IMAGE' : 'TEXT',
      status: 'PENDING',
      inputText: inputText,
      inputImage: selectedImage || undefined,
      customInstructions: customInstructions, // Snapshot current settings
      template: outputTemplate, // Snapshot current template
      createdAt: new Date().toLocaleTimeString(),
    };

    setTasks(prev => [newTask, ...prev]);
    setInputText('');
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatOutput = (result: AIQuoteResponse, template?: string) => {
    let text = template || DEFAULT_TEMPLATE;
    const map: Record<string, string> = {
      '{hotelName}': result.hotelName || '',
      '{location}': result.location || '',
      '{dates}': result.dates || '',
      '{roomType}': result.roomType || '',
      '{estimatedPrice}': result.estimatedPrice || '',
      '{recommendation}': result.recommendation || '',
      '{breakfast}': result.breakfast || '未提及',
      '{cancellationPolicy}': result.cancellationPolicy || '以确认单为准',
      '{otherInfo}': result.otherInfo || ''
    };

    for (const key in map) {
      text = text.replace(new RegExp(key, 'g'), map[key]);
    }
    return text;
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    const btn = document.activeElement as HTMLElement;
    if(btn) {
        const originalText = btn.innerText;
        btn.innerText = "已复制!";
        setTimeout(() => btn.innerText = originalText, 1000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 flex flex-col md:h-[calc(100vh-140px)]">
       <div className="flex flex-col gap-2 flex-shrink-0">
         <div className="flex justify-between items-start">
            <div>
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">AI 智能查价中心</span>
                <span className="text-xs font-normal px-2 py-1 bg-purple-100 text-purple-700 rounded-full hidden md:inline-block">Gemini 多模态</span>
                </h2>
                <p className="text-gray-500 text-sm mt-1">上传聊天截图或输入需求，自动生成报价。</p>
            </div>
            <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${
                    showSettings ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
            >
                ⚙️ <span className="hidden md:inline">查价配置</span>
            </button>
         </div>
       </div>

       {/* Main Grid: Stack on mobile, grid on desktop */}
       <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
         
         {/* Left Column: Input (Fixed height on desktop, auto on mobile) */}
         <Card className="flex flex-col lg:col-span-1 border-t-4 border-t-blue-500 overflow-hidden min-h-[400px]">
           {showSettings ? (
             <div className="flex flex-col h-full gap-4 animate-fadeIn">
                <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-800">查价偏好设置</h3>
                    <button onClick={() => setShowSettings(false)} className="text-xs text-blue-600 hover:underline">返回任务</button>
                </div>
                
                <div className="space-y-4 overflow-y-auto pr-2 flex-1">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">AI 额外指令 (Prompt)</label>
                        <p className="text-[10px] text-gray-400 mb-2">告诉 AI 特别的注意事项。</p>
                        <textarea 
                            value={customInstructions}
                            onChange={(e) => setCustomInstructions(e.target.value)}
                            className="w-full h-24 px-3 py-2 text-sm rounded border border-gray-300 focus:border-blue-500 outline-none resize-none"
                            placeholder="例如：语气要非常客气；必须提取是否含早餐..."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">输出文案模板</label>
                        <textarea 
                            value={outputTemplate}
                            onChange={(e) => setOutputTemplate(e.target.value)}
                            className="w-full h-48 px-3 py-2 text-sm font-mono rounded border border-gray-300 focus:border-blue-500 outline-none resize-none bg-gray-50"
                        />
                        <button 
                           onClick={() => setOutputTemplate(DEFAULT_TEMPLATE)}
                           className="text-xs text-gray-400 underline mt-1"
                        >恢复默认模板</button>
                    </div>
                </div>
             </div>
           ) : (
             <div className="flex flex-col h-full gap-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">图片输入 (支持截图)</label>
                 <div 
                   onClick={() => fileInputRef.current?.click()}
                   className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                      selectedImage ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                   }`}
                 >
                   <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
                   {selectedImage ? (
                     <div className="relative w-full h-32">
                       <img src={selectedImage} alt="Preview" className="w-full h-full object-contain rounded" />
                       <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
                          className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-sm hover:bg-red-600"
                       >×</button>
                     </div>
                   ) : (
                     <>
                       <span className="text-2xl mb-2">📷</span>
                       <p className="text-xs text-gray-500 text-center">点击上传</p>
                     </>
                   )}
                 </div>
               </div>

               <div className="flex-1 min-h-[100px]">
                 <label className="block text-sm font-medium text-gray-700 mb-2">补充需求 / 文本</label>
                 <textarea 
                   value={inputText}
                   onChange={(e) => setInputText(e.target.value)}
                   className="w-full h-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm"
                   placeholder="输入需求或粘贴聊天记录..."
                 ></textarea>
               </div>

               {customInstructions && (
                   <div className="bg-amber-50 border border-amber-100 p-2 rounded text-xs text-amber-700 flex items-center gap-2">
                       <span>⚠️ 已启用自定义 AI 指令</span>
                   </div>
               )}

               <button 
                 onClick={handleAddTask}
                 disabled={!inputText && !selectedImage}
                 className={`w-full py-3 rounded-lg font-semibold text-white transition-all flex justify-center items-center gap-2 ${
                   !inputText && !selectedImage
                     ? 'bg-gray-300 cursor-not-allowed' 
                     : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg'
                 }`}
               >
                 + 添加查价任务
               </button>
             </div>
           )}
         </Card>

         {/* Right Column: Task List (Scrollable) */}
         <div className="lg:col-span-2 space-y-4 md:overflow-y-auto md:pr-2 md:h-full">
            {tasks.length === 0 && (
                <div className="h-64 md:h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                    <span className="text-4xl mb-3">📋</span>
                    <p>任务队列为空</p>
                </div>
            )}

            {tasks.map((task) => (
                <Card key={task.id} className={`transition-all ${task.status === 'PROCESSING' ? 'ring-2 ring-blue-100' : ''}`}>
                    <div className="flex justify-between items-start mb-3 border-b border-gray-50 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                task.status === 'PENDING' ? 'bg-gray-100 text-gray-600' :
                                task.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                                task.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                                'bg-green-100 text-green-700'
                            }`}>
                                {task.status === 'PENDING' && '⏳ 排队中'}
                                {task.status === 'PROCESSING' && '⚙️ 分析中'}
                                {task.status === 'COMPLETED' && '✅ 已完成'}
                                {task.status === 'FAILED' && '❌ 失败'}
                            </span>
                            <span className="text-xs text-gray-400 hidden sm:inline">ID: {task.id.split('-')[1]}</span>
                        </div>
                        <div className="text-xs text-gray-500 font-medium">
                            {task.type === 'IMAGE' ? '📷 图片' : '📝 文本'}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                        {/* Task Input Preview */}
                        <div className="w-full sm:w-1/4 sm:min-w-[100px] sm:border-r border-gray-100 sm:pr-4 flex flex-col gap-2">
                            <div>
                                {task.inputImage && (
                                    <img src={task.inputImage} alt="Input" className="w-full h-24 sm:h-20 object-cover rounded mb-2 border border-gray-200" />
                                )}
                                <p className="text-xs text-gray-600 line-clamp-3 italic">
                                    "{task.inputText || (task.inputImage ? '图片内容' : '无文本')}"
                                </p>
                            </div>
                        </div>

                        {/* Task Result */}
                        <div className="flex-1">
                            {task.status === 'COMPLETED' && task.result ? (
                                <div className="space-y-3">
                                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                                        <div>
                                            <h4 className="font-bold text-gray-800 text-sm sm:text-base">{task.result.hotelName}</h4>
                                            <p className="text-xs text-gray-500">{task.result.dates}</p>
                                            <div className="flex gap-2 mt-1">
                                                {task.result.breakfast && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100">{task.result.breakfast}</span>}
                                            </div>
                                        </div>
                                        <div className="text-left sm:text-right">
                                            <p className="font-bold text-lg text-green-600">{task.result.estimatedPrice}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 relative group font-mono text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                                        {formatOutput(task.result, task.template)}
                                        
                                        <button 
                                            onClick={(e) => task.result && handleCopy(formatOutput(task.result, task.template))}
                                            className="absolute top-2 right-2 bg-white border border-gray-200 text-gray-700 text-xs px-2 py-1 rounded shadow-sm opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50 hover:text-black"
                                        >
                                            复制
                                        </button>
                                    </div>
                                </div>
                            ) : task.status === 'FAILED' ? (
                                <div className="flex items-center justify-center h-full text-red-500 text-sm bg-red-50 rounded-lg p-4">
                                    {task.error || '无法处理该请求'}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2 h-full justify-center min-h-[100px]">
                                    <div className="h-2 bg-gray-100 rounded w-3/4 animate-pulse"></div>
                                    <div className="h-2 bg-gray-100 rounded w-1/2 animate-pulse"></div>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            ))}
         </div>
       </div>
    </div>
  );
};
