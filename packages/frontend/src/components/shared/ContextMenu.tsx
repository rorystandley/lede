import { useEffect, useRef, useState } from 'react';

interface SubItem {
  label: string;
  value: string | number;
  active?: boolean;
}

interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
  children?: SubItem[];
  onChildClick?: (value: string | number) => void;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  // Keep menu in viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - items.length * 36 - 16),
    zIndex: 100,
  };

  return (
    <div ref={ref} style={style} className="w-44 bg-surface border border-border rounded-lg shadow-lg py-1 animate-in fade-in">
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={() => {
              if (item.children) {
                setExpandedIndex(expandedIndex === i ? null : i);
              } else {
                item.onClick();
                onClose();
              }
            }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-surface-tertiary ${item.danger ? 'text-red-500 hover:text-red-600' : 'text-text-primary'}`}
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {item.children && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expandedIndex === i ? 'rotate-90' : ''}`}><polyline points="9 18 15 12 9 6" /></svg>
            )}
          </button>
          {item.children && expandedIndex === i && (
            <div className="py-0.5 bg-surface-secondary">
              {item.children.map((child) => (
                <button
                  key={child.value}
                  onClick={() => { item.onChildClick?.(child.value); onClose(); }}
                  className={`w-full flex items-center gap-2 px-5 py-1 text-xs text-left hover:bg-surface-tertiary ${child.active ? 'text-primary-600 font-medium' : 'text-text-secondary'}`}
                >
                  {child.active && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                  {child.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
