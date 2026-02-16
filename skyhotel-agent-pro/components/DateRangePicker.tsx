import React, { useState, useEffect, useMemo } from 'react';

interface DateRangePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (start: string, end: string) => void;
  initialStartDate?: string;
  initialEndDate?: string;
}

const WEEKS = ['日', '一', '二', '三', '四', '五', '六'];

// Helper to format YYYY-MM-DD
const dateToString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Helper to parse YYYY-MM-DD to Date (at midnight local time to avoid timezone issues)
const stringToDate = (str: string) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  initialStartDate, 
  initialEndDate 
}) => {
  const [startDate, setStartDate] = useState<string | null>(initialStartDate || null);
  const [endDate, setEndDate] = useState<string | null>(initialEndDate || null);

  useEffect(() => {
    if (isOpen) {
      setStartDate(initialStartDate || null);
      setEndDate(initialEndDate || null);
    }
  }, [isOpen, initialStartDate, initialEndDate]);

  // Generate next 6 months
  const months = useMemo(() => {
    const today = new Date();
    const result = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      result.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        dateObj: d
      });
    }
    return result;
  }, []);

  const todayStr = dateToString(new Date());
  const tomorrowStr = dateToString(new Date(new Date().setDate(new Date().getDate() + 1)));

  const handleDateClick = (dateStr: string) => {
    if (dateStr < todayStr) return; // Disable past dates

    if (!startDate || (startDate && endDate)) {
      // Start new selection
      setStartDate(dateStr);
      setEndDate(null);
    } else {
      // Select end date
      if (dateStr < startDate) {
        setStartDate(dateStr); // User clicked a date before start, reset start
      } else if (dateStr === startDate) {
         // Clicked same day, do nothing or allow single day (but hotel usually 1 night min)
      } else {
        setEndDate(dateStr);
        // Optional: Auto close after short delay
        setTimeout(() => {
            onConfirm(startDate, dateStr);
            onClose();
        }, 300);
      }
    }
  };

  if (!isOpen) return null;

  // Render Logic
  const renderMonth = (year: number, month: number) => {
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay(); // 0-6
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const days = [];
    // Padding for empty days
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-14"></div>);
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const current = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = current === todayStr;
      const isTomorrow = current === tomorrowStr;
      const isPast = current < todayStr;
      
      const isStart = startDate === current;
      const isEnd = endDate === current;
      const isInRange = startDate && endDate && current > startDate && current < endDate;

      let label = '';
      if (isToday) label = '今天';
      else if (isTomorrow) label = '明天';

      // Simple Holiday Logic (Demo)
      if (month === 2 && d === 17) label = '春节'; // Mock 2026 data based on screenshot
      if (month === 3 && d === 3) label = '元宵';

      // Selection State Styles
      let containerClass = "h-14 flex flex-col items-center justify-center relative z-10 font-medium text-sm rounded-lg transition-colors";
      let textClass = "text-gray-900";
      let subTextClass = "text-[10px] text-gray-500";

      if (isPast) {
          textClass = "text-gray-300 line-through";
          subTextClass = "text-gray-200";
      } else {
          containerClass += " cursor-pointer";
      }

      if (isStart || isEnd) {
          containerClass += " bg-[#1d3c34] text-white shadow-md"; // Dark green from screenshot
          textClass = "text-white font-bold";
          subTextClass = "text-white/80";
          if (isStart) label = '入住';
          if (isEnd) label = '离店';
      } else if (isInRange) {
          containerClass += " bg-[#e8f5e9] rounded-none"; // Light green range
          textClass = "text-[#1d3c34]";
      }

      days.push(
        <div 
            key={current} 
            onClick={() => !isPast && handleDateClick(current)}
            className={`${containerClass}`}
        >
            {/* Range connector visuals */}
            {(isInRange || isEnd) && startDate && <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-[#e8f5e9] -z-10" />}
            {(isInRange || isStart) && endDate && <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-[#e8f5e9] -z-10" />}
            
            <span className={textClass}>{d}</span>
            <span className={`scale-90 ${subTextClass}`}>{label}</span>
        </div>
      );
    }

    return (
      <div key={`${year}-${month}`} className="mb-6">
        <h3 className="font-bold text-gray-900 px-4 mb-4 text-base sticky top-0 bg-white/90 backdrop-blur-sm py-2 z-20">
            {year}年{month}月
        </h3>
        <div className="grid grid-cols-7 gap-y-2 text-center px-2">
           {days}
        </div>
      </div>
    );
  };

  const getDayCount = () => {
      if (!startDate || !endDate) return 0;
      const start = stringToDate(startDate);
      const end = stringToDate(endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  };

  return (
    <div className="fixed inset-0 bg-white z-[100] flex flex-col animate-slideUp">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 p-4 shadow-sm z-30">
        <div className="flex justify-between items-center mb-4">
             <button onClick={onClose} className="text-gray-400">
                 <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                 </svg>
             </button>
             <h2 className="text-lg font-bold">选择日期</h2>
             <button 
                onClick={() => {
                    if (startDate && endDate) {
                        onConfirm(startDate, endDate);
                        onClose();
                    }
                }}
                className={`text-sm font-bold ${startDate && endDate ? 'text-[#1d3c34]' : 'text-gray-300'}`}
             >
                 完成
             </button>
        </div>
        
        <div className="flex justify-between items-end px-4">
            <div className={`flex flex-col ${!startDate ? 'text-gray-400' : 'text-[#1d3c34]'}`}>
                <span className="text-xs mb-1">入住日期</span>
                <span className="text-xl font-bold">
                    {startDate ? `${startDate.split('-')[1]}月${startDate.split('-')[2]}日` : '请选择'}
                </span>
                <span className="text-xs text-gray-400 mt-1">
                    {startDate === todayStr ? '今天' : startDate ? WEEKS[stringToDate(startDate).getDay()] : ''}
                </span>
            </div>
            
            <div className="mb-2 px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                {startDate && endDate ? `共 ${getDayCount()} 晚` : '请选择离店'}
            </div>

            <div className={`flex flex-col text-right ${!endDate ? 'text-gray-400' : 'text-[#1d3c34]'}`}>
                <span className="text-xs mb-1">离店日期</span>
                <span className="text-xl font-bold">
                    {endDate ? `${endDate.split('-')[1]}月${endDate.split('-')[2]}日` : '请选择'}
                </span>
                <span className="text-xs text-gray-400 mt-1">
                    {endDate === tomorrowStr ? '明天' : endDate ? WEEKS[stringToDate(endDate).getDay()] : ''}
                </span>
            </div>
        </div>
      </div>

      {/* Week Header */}
      <div className="grid grid-cols-7 text-center py-2 bg-gray-50 text-xs text-gray-500 font-medium">
         {WEEKS.map(w => <span key={w}>{w}</span>)}
      </div>

      {/* Calendar Scroll Area */}
      <div className="flex-1 overflow-y-auto pb-safe">
         {months.map(m => renderMonth(m.year, m.month))}
         <div className="h-20"></div> {/* Bottom padding */}
      </div>
      
      {/* Floating Confirm (Optional visual cue) */}
      {startDate && endDate && (
        <div className="absolute bottom-6 left-4 right-4 z-40">
           <button 
              onClick={() => {
                onConfirm(startDate, endDate);
                onClose();
              }}
              className="w-full bg-[#1d3c34] text-white py-3 rounded-full font-bold shadow-lg text-lg"
           >
               确认 {getDayCount()} 晚
           </button>
        </div>
      )}
    </div>
  );
};
