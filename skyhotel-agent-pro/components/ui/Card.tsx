
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, action }) => {
  // Determine if this is a "raw" card (e.g., for tables) based on the presence of 'p-0' in className.
  // If so, we adjust the inner container to allow flex growth and scrolling.
  const isRaw = className.includes('p-0');

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
          {title && <h3 className="font-semibold text-gray-800">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={isRaw ? 'flex-1 flex flex-col min-h-0' : 'p-6'}>
        {children}
      </div>
    </div>
  );
};
