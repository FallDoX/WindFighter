import { Lock, Unlock, Clock } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DataPoint {
  label: string;
  value: number | null;
  color: string;
  unit?: string;
}

interface ChartInfoBarProps {
  data: DataPoint[];
  timestamp: string;
  isVisible: boolean;
  isFrozen: boolean;
  onToggleFreeze: () => void;
  attemptInfo?: {
    attemptNumber: number;
    speedRange: string;
  };
}

export function ChartInfoBar({
  data,
  timestamp,
  isVisible,
  isFrozen,
  onToggleFreeze,
  attemptInfo
}: ChartInfoBarProps) {
  if (!isVisible) return null;

  return (
    <div 
      onClick={onToggleFreeze}
      className={cn(
        "bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 shadow-lg px-4 py-3 cursor-pointer hover:bg-white/10 transition-all duration-200 mb-4 md:mb-6",
        isFrozen && "ring-2 ring-cyan-500/30 border-cyan-500/30"
      )}
      title={isFrozen ? "Нажмите чтобы разморозить данные" : "Нажмите чтобы зафиксировать данные"}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {isFrozen && <Lock className="w-4 h-4 text-cyan-400" />}
          {attemptInfo ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-200">
                Попытка {attemptInfo.attemptNumber}
              </span>
              <span className="text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded">
                {attemptInfo.speedRange}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-bold text-slate-200">{timestamp}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isFrozen ? (
            <div className="flex items-center gap-1 text-xs text-cyan-300 bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/30">
              <Lock className="w-3 h-3" />
              Зафиксировано
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded border border-slate-600">
              <Unlock className="w-3 h-3" />
              Авто
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-6 overflow-x-auto pb-2 flex-wrap">
        {data.filter(d => d.value !== null).map((item, index) => (
          <div key={index} className="flex items-center gap-2 flex-shrink-0 bg-slate-800/30 px-3 py-2 rounded-lg border border-white/5">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-slate-400 font-medium">{item.label}</span>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-bold text-slate-100">
                  {typeof item.value === 'number' && !isNaN(item.value)
                    ? item.value.toFixed(item.unit === '%' ? 1 : 0)
                    : '-'}
                </span>
                {item.unit && (
                  <span className="text-[10px] text-slate-500 font-medium">{item.unit}</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {data.filter(d => d.value !== null).length === 0 && (
          <div className="flex items-center gap-2 text-slate-500 bg-slate-800/30 px-3 py-2 rounded-lg border border-white/5">
            <div className="w-3 h-3 rounded-full bg-slate-600" />
            <span className="text-sm">Нет данных</span>
          </div>
        )}
      </div>
    </div>
  );
}
