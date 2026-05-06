import { memo, useState, useMemo, useEffect } from 'react';
import { ChartWithZoom } from './ChartWithZoom';
import type { AccelerationAttempt, TripEntry, ThresholdPair } from '../types';
import type { AccelerationConfig } from '../utils/acceleration';
// TODO: Implement speed correction UI
// import { calculateSpeedCorrection } from '../utils/acceleration';

interface CustomPreset extends ThresholdPair {
  id: string;
  label: string;
}

interface AccelerationTabProps {
  accelerationAttempts: AccelerationAttempt[];
  data: TripEntry[];
  clearSettings?: () => void;
  speedSource?: 'gps' | 'wheel';
  onSpeedSourceChange?: (source: 'gps' | 'wheel') => void;
  thresholdPairs?: ThresholdPair[];
  onThresholdPairsChange?: (pairs: ThresholdPair[]) => void;
  detectionConfig?: AccelerationConfig;
  onDetectionConfigChange?: (config: AccelerationConfig) => void;
}

// WindFighter Unified Color Palette (6 core colors)
// primary: #3b82f6, success: #10b981, warning: #f59e0b, danger: #ef4444, info: #8b5cf6, accent: #06b6d4
const PRESET_COLORS = {
  '0-25': '#3b82f6',   // primary
  '0-60': '#10b981',   // success
  '0-90': '#f59e0b',   // warning
  '0-100': '#ef4444',  // danger
  'custom': '#8b5cf6', // info
};

const ATTEMPT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', // 5 core colors
  '#ec4899', '#f97316', '#06b6d4', '#a78bfa', '#fb923c'  // Extended for multiple attempts
];

const PRESETS = [
  { id: '0-25', from: 0, to: 25, label: '0-25' },
  { id: '0-60', from: 0, to: 60, label: '0-60' },
  { id: '0-90', from: 0, to: 90, label: '0-90' },
  { id: '0-100', from: 0, to: 100, label: '0-100' },
  { id: 'custom', from: -1, to: -1, label: 'Все' },
];

export const AccelerationTab = memo(({
  accelerationAttempts,
  data,
  clearSettings,
  speedSource = 'gps',
  onSpeedSourceChange,
  thresholdPairs = [],
  onThresholdPairsChange,
  detectionConfig,
  onDetectionConfigChange,
}: AccelerationTabProps) => {
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [newPresetFrom, setNewPresetFrom] = useState('');
  const [newPresetTo, setNewPresetTo] = useState('');
  const [visibleAttempts, setVisibleAttempts] = useState<Set<string>>(new Set());
  const [maxTimeFilter, setMaxTimeFilter] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('max_time_filter');
      if (saved) {
        return JSON.parse(saved);
      }
      return 30; // Default 30 seconds
    } catch {
      return 30;
    }
  });
  const [sortField, setSortField] = useState<keyof AccelerationAttempt | null>('time');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // TODO: Implement UI for detection configuration
  // For now, just prevent unused variable warnings
  void detectionConfig;
  void onDetectionConfigChange;

  // Initialize visible attempts when accelerationAttempts change
  useEffect(() => {
    setVisibleAttempts(new Set(accelerationAttempts.map(a => a.id)));
  }, [accelerationAttempts]);

  // Persist maxTimeFilter to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('max_time_filter', JSON.stringify(maxTimeFilter));
    } catch {
      // Silent fail - localStorage unavailable
    }
  }, [maxTimeFilter]);

  const toggleAttemptVisibility = (attemptId: string) => {
    setVisibleAttempts(prev => {
      const next = new Set(prev);
      if (next.has(attemptId)) {
        next.delete(attemptId);
      } else {
        next.add(attemptId);
      }
      return next;
    });
  };

  const togglePreset = (presetId: string) => {
    setSelectedPresets(prev => {
      const next = new Set(prev);
      if (next.has(presetId)) {
        next.delete(presetId);
      } else {
        next.add(presetId);
      }
      return next;
    });
  };

  const addCustomPreset = () => {
    const from = parseFloat(newPresetFrom);
    const to = parseFloat(newPresetTo);
    
    if (isNaN(from) || isNaN(to) || from >= to) {
      alert('Введите корректные значения (от < до)');
      return;
    }

    const newPreset: CustomPreset = {
      id: `custom-${Date.now()}`,
      from,
      to,
      label: `${from}-${to}`,
    };

    setCustomPresets(prev => [...prev, newPreset]);
    
    // Also update thresholdPairs for acceleration detection
    if (onThresholdPairsChange) {
      onThresholdPairsChange([...thresholdPairs, { from, to }]);
    }
    
    setNewPresetFrom('');
    setNewPresetTo('');
  };

  const removeCustomPreset = (presetId: string) => {
    const presetToRemove = customPresets.find(p => p.id === presetId);
    
    setCustomPresets(prev => prev.filter(p => p.id !== presetId));
    setSelectedPresets(prev => {
      const next = new Set(prev);
      next.delete(presetId);
      return next;
    });
    
    // Also update thresholdPairs for acceleration detection
    if (onThresholdPairsChange && presetToRemove) {
      onThresholdPairsChange(thresholdPairs.filter(pair => 
        !(pair.from === presetToRemove.from && pair.to === presetToRemove.to)
      ));
    }
  };

  // Combine standard presets with custom presets
  const allPresets = useMemo(() => {
    return [...PRESETS, ...customPresets];
  }, [customPresets]);

  // Sort function
  const handleSort = (field: keyof AccelerationAttempt) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Unified filtered attempts - apply time filter only (visibility handled in UI)
  const filteredAttempts = useMemo(() => {
    let attempts = [...accelerationAttempts]
      .filter(attempt => attempt.time <= maxTimeFilter); // Time filter only
    
    // Apply sorting
    if (sortField) {
      attempts.sort((a, b) => {
        let aValue: any = a[sortField];
        let bValue: any = b[sortField];
        
        // Special handling for thresholdPair
        if (sortField === 'thresholdPair') {
          aValue = `${a.thresholdPair.from}-${a.thresholdPair.to}`;
          bValue = `${b.thresholdPair.from}-${b.thresholdPair.to}`;
        }
        
        if (typeof aValue === 'string') {
          return sortDirection === 'asc' 
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }
        
        return sortDirection === 'asc' 
          ? (aValue || 0) - (bValue || 0)
          : (bValue || 0) - (aValue || 0);
      });
    }
    
    return attempts;
  }, [accelerationAttempts, maxTimeFilter, sortField, sortDirection]);

  // Visible attempts for chart (only attempts that are visible on chart)
  const visibleFilteredAttempts = useMemo(() => {
    return filteredAttempts.filter(attempt => visibleAttempts.has(attempt.id));
  }, [filteredAttempts, visibleAttempts]);

  // Calculate time range from selected attempts (in seconds from start)
  const timeRange = useMemo(() => {
    let maxDuration = 0;

    selectedPresets.forEach(presetId => {
      const preset = allPresets.find(p => p.id === presetId);
      if (!preset) return;

      // Filter attempts that match preset range
      const presetAttempts = visibleFilteredAttempts.filter(
        attempt => {
          if (preset.id === 'custom' || preset.id.startsWith('custom-')) {
            // For 'custom' preset and user-created custom presets, show all attempts
            return true;
          }
          // For specific presets, match exact range
          return attempt.thresholdPair.to >= preset.to && attempt.thresholdPair.from === preset.from;
        }
      );

      presetAttempts.forEach(attempt => {
        maxDuration = Math.max(maxDuration, attempt.time);
      });
    });

    if (selectedPresets.has('custom') || selectedPresets.size === 0) {
      visibleFilteredAttempts.forEach(attempt => {
        maxDuration = Math.max(maxDuration, attempt.time);
      });
    }

    // Always return a valid time range if there are attempts, even if duration is 0
    const timeRange = maxDuration > 0 ? { start: 0, end: maxDuration } : { start: 0, end: 1 };
    return timeRange;
  }, [visibleFilteredAttempts, selectedPresets, allPresets]);

  const accelerationChartData = useMemo(() => {
    const datasets: Array<{
      label: string;
      data: Array<{ x: number; y: number }>;
      borderColor: string;
      backgroundColor: string;
      fill: boolean;
      tension: number;
      pointRadius: number;
    }> = [];

    selectedPresets.forEach(presetId => {
      const preset = allPresets.find(p => p.id === presetId);
      if (!preset) return;

      // Filter attempts that match preset range AND are visible and pass time filter
      const presetAttempts = visibleFilteredAttempts.filter(
        attempt => {
          // Then check preset matching
          if (preset.id === 'custom' || preset.id.startsWith('custom-')) {
            // For 'custom' preset and user-created custom presets, show all attempts
            return true;
          }
          // For specific presets, match exact range
          return attempt.thresholdPair.to >= preset.to && attempt.thresholdPair.from === preset.from;
        }
      );

      presetAttempts.forEach((attempt, index) => {

        const attemptData = data.filter(
          e => e.timestamp >= attempt.startTimestamp && e.timestamp <= attempt.endTimestamp
        );

        if (attemptData.length > 0) {
          // Find the original index of this attempt to use consistent colors
          const originalIndex = accelerationAttempts.findIndex(a => a.id === attempt.id);
          
          // Prepare chart data starting from appropriate speed
          let chartData = attemptData.map(e => ({ x: (e.timestamp - attempt.startTimestamp) / 1000, y: e.Speed }));
          
          // Add starting point based on acceleration type
          if (attempt.thresholdPair.from === 0) {
            // Traditional 0-to-X acceleration: start from (0, 0)
            chartData.unshift({ x: 0, y: 0 });
          } else {
            // Roll-on acceleration: start from (0, initial speed)
            chartData.unshift({ x: 0, y: attempt.thresholdPair.from });
          }
          
          // If preset has a target speed, truncate data to that speed
          if (preset.to > 0) {
            const targetIndex = chartData.findIndex(point => point.y >= preset.to);
            if (targetIndex !== -1) {
              chartData = chartData.slice(0, targetIndex + 1);
            }
          }
          
          datasets.push({
            label: `${preset.label} #${index + 1} (${attempt.time.toFixed(2)}с, ${attempt.distance.toFixed(1)}м)`,
            data: chartData,
            borderColor: ATTEMPT_COLORS[originalIndex % ATTEMPT_COLORS.length],
            backgroundColor: `${ATTEMPT_COLORS[originalIndex % ATTEMPT_COLORS.length]}33`,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
          });
        }
      });
    });

    // Show all attempts if no presets selected OR only custom selected
    const hasOnlyCustom = selectedPresets.size === 1 && selectedPresets.has('custom');
    const hasNoPresets = selectedPresets.size === 0;
    if (hasNoPresets || hasOnlyCustom) {
      visibleFilteredAttempts.forEach((attempt, index) => {
        // Only visible attempts are included in visibleFilteredAttempts

        const attemptData = data.filter(
          e => e.timestamp >= attempt.startTimestamp && e.timestamp <= attempt.endTimestamp
        );

        if (attemptData.length > 0) {
          // Prepare chart data starting from appropriate speed
          let chartData = attemptData.map(e => ({ x: (e.timestamp - attempt.startTimestamp) / 1000, y: e.Speed }));
          
          // Add starting point based on acceleration type
          if (attempt.thresholdPair.from === 0) {
            // Traditional 0-to-X acceleration: start from (0, 0)
            chartData.unshift({ x: 0, y: 0 });
          } else {
            // Roll-on acceleration: start from (0, initial speed)
            chartData.unshift({ x: 0, y: attempt.thresholdPair.from });
          }
          
          // Truncate data to target speed to prevent post-peak decline
          if (attempt.thresholdPair.to > 0) {
            const targetIndex = chartData.findIndex(point => point.y >= attempt.thresholdPair.to);
            if (targetIndex !== -1) {
              chartData = chartData.slice(0, targetIndex + 1);
            }
          }
          
          datasets.push({
            label: `#${index + 1} (${attempt.thresholdPair.from}-${attempt.thresholdPair.to} км/ч, ${attempt.time.toFixed(2)}с, ${attempt.distance.toFixed(1)}м)`,
            data: chartData,
            borderColor: ATTEMPT_COLORS[index % ATTEMPT_COLORS.length],
            backgroundColor: `${ATTEMPT_COLORS[index % ATTEMPT_COLORS.length]}33`,
            fill: false,
            tension: 0.1,
            pointRadius: 0,
          });
        }
      });
    }

    // Return datasets array (Chart.js requires datasets to always be an array)
    return { datasets };
  }, [visibleFilteredAttempts, selectedPresets, data, visibleAttempts]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false, // Hide legend - using custom toggles instead
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(148, 163, 184, 0.2)',
        borderWidth: 1,
        callbacks: {
          title: (context: any) => {
            const dataset = context[0].dataset;
            return dataset.label || 'Ускорение';
          },
          label: (context: any) => {
            const point = context.parsed;
            
            const time = point.x.toFixed(2);
            const speed = point.y.toFixed(1);
            
            return [
              `Время: ${time} сек`,
              `Скорость: ${speed} км/ч`,
              `Источник: ${speedSource === 'gps' ? 'GPS' : 'Колесная'}`
            ];
          }
        }
      },
    },
    scales: {
      x: {
        type: 'linear' as const,
        title: {
          display: true,
          text: 'Время (сек)',
          color: '#94a3b8',
          font: { size: 11 },
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 10 },
        },
      },
      y: {
        title: {
          display: true,
          text: 'Скорость (км/ч)',
          color: '#94a3b8',
          font: { size: 11 },
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 10 },
        },
      },
    },
  }), [visibleFilteredAttempts, selectedPresets, allPresets, data, speedSource]);

  return (
    <div className="space-y-4">
      {/* Live region for screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {selectedPresets.size > 0 ? `Выбрано пресетов: ${selectedPresets.size}` : 'Пресеты не выбраны'}
      </div>

      {/* Unified Settings Table */}
      <div className="bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Настройки ускорений</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {/* Speed Source Row */}
              {onSpeedSourceChange && (
                <tr className="border-b border-white/5">
                  <td className="px-4 py-3 text-slate-300 font-medium w-1/4">Источник скорости</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => onSpeedSourceChange('gps')}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                          speedSource === 'gps' 
                            ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300' 
                            : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
                        }`}
                        title="GPS скорость более точна для анализа ускорений"
                      >
                        GPS
                      </button>
                      <button
                        onClick={() => onSpeedSourceChange('wheel')}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                          speedSource === 'wheel' 
                            ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300' 
                            : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'
                        }`}
                        title="Колесная скорость от датчика мотора"
                      >
                        Колесная
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              
              {/* Time Filter Row */}
              <tr className="border-b border-white/5">
                <td className="px-4 py-3 text-slate-300 font-medium w-1/4">
                  <div className="flex flex-col gap-1">
                    <span>Фильтр по времени</span>
                    <span className="text-[10px] text-slate-500 font-normal">Макс. время разгона</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={maxTimeFilter}
                        onChange={(e) => setMaxTimeFilter(parseFloat(e.target.value) || 30)}
                        className="w-20 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-300 text-xs focus:outline-none focus:border-blue-500"
                        placeholder="30"
                        min="1"
                        max="300"
                      />
                      <span className="text-xs text-slate-400">секунд</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setMaxTimeFilter(10)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                          maxTimeFilter === 10
                            ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300'
                            : 'bg-slate-700/50 border border-slate-600 text-slate-400 hover:bg-slate-600/70'
                        }`}
                      >
                        10с
                      </button>
                      <button
                        onClick={() => setMaxTimeFilter(30)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                          maxTimeFilter === 30
                            ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300'
                            : 'bg-slate-700/50 border border-slate-600 text-slate-400 hover:bg-slate-600/70'
                        }`}
                      >
                        30с
                      </button>
                      <button
                        onClick={() => setMaxTimeFilter(60)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                          maxTimeFilter === 60
                            ? 'bg-blue-500/20 border border-blue-500/30 text-blue-300'
                            : 'bg-slate-700/50 border border-slate-600 text-slate-400 hover:bg-slate-600/70'
                        }`}
                      >
                        60с
                      </button>
                    </div>
                    {accelerationAttempts.length > 0 && (
                      <span className="text-[10px] text-slate-500">
                        {accelerationAttempts.filter(a => a.time <= maxTimeFilter).length}/{accelerationAttempts.length} попыток
                      </span>
                    )}
                  </div>
                </td>
              </tr>
              
              {/* Presets Row */}
              <tr className="border-b border-white/5">
                <td className="px-4 py-3 text-slate-300 font-medium w-1/4">Диапазоны разгона</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {allPresets.map((preset) => {
                      const attemptCount = preset.id === 'custom'
                        ? accelerationAttempts.length
                        : accelerationAttempts.filter(
                            attempt => attempt.thresholdPair.to >= preset.to && attempt.thresholdPair.from === preset.from
                          ).length;

                      const isCustom = preset.id.startsWith('custom-');
                      const presetColor = isCustom ? '#8b5cf6' : PRESET_COLORS[preset.id as keyof typeof PRESET_COLORS];

                      return (
                        <button
                          key={preset.id}
                          onClick={() => togglePreset(preset.id)}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition-all border relative ${
                            selectedPresets.has(preset.id)
                              ? `${presetColor}20 border ${presetColor}60 text-white`
                              : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-600/70'
                          }`}
                          title={`Разгон ${preset.label} км/ч. ${attemptCount > 0 ? `Найдено попыток: ${attemptCount}` : 'Нет попыток'}`}
                        >
                          <span className="flex items-center gap-1">
                            {preset.label}
                            {attemptCount > 0 && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                selectedPresets.has(preset.id)
                                  ? 'bg-white/30 text-white'
                                  : 'bg-slate-600 text-slate-300'
                              }`}>
                                {attemptCount}
                              </span>
                            )}
                            {isCustom && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeCustomPreset(preset.id);
                                }}
                                className="ml-1 w-3 h-3 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 flex items-center justify-center text-[10px]"
                                aria-label={`Удалить пресет ${preset.label}`}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        </button>
                      );
                    })}
                    {/* Быстрое добавление кастомного диапазона */}
                    <div className="flex items-center gap-1 px-2 py-1 bg-slate-800/50 border border-slate-700 rounded">
                      <input
                        type="number"
                        placeholder="От"
                        value={newPresetFrom}
                        onChange={(e) => setNewPresetFrom(e.target.value)}
                        className="w-12 px-1 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
                        min="0"
                        max="200"
                      />
                      <span className="text-slate-400 text-xs">-</span>
                      <input
                        type="number"
                        placeholder="До"
                        value={newPresetTo}
                        onChange={(e) => setNewPresetTo(e.target.value)}
                        className="w-12 px-1 py-0.5 bg-slate-700 border border-slate-600 rounded text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
                        min="0"
                        max="200"
                      />
                      <button
                        onClick={addCustomPreset}
                        className="px-2 py-0.5 bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 rounded text-xs font-medium transition-all"
                        aria-label="Добавить диапазон"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                  {selectedPresets.has('custom') && (
                    <div className="mt-2 text-xs text-slate-500">
                      Выбраны все попытки
                    </div>
                  )}
                </td>
              </tr>
              
              {/* Actions Row */}
              {clearSettings && (
                <tr>
                  <td className="px-4 py-3 text-slate-300 font-medium w-1/4">Действия</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (confirm('Очистить настройки ускорения? Это сбросит порог и выбранные колонки к значениям по умолчанию.')) {
                            clearSettings();
                            alert('Настройки очищены');
                          }
                        }}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-slate-700/50 border border-slate-600 text-slate-400 hover:bg-slate-600/70 transition-all"
                        aria-label="Очистить настройки ускорения"
                      >
                        Очистить настройки
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      
      {/* Acceleration Attempts Table */}
      {accelerationAttempts.length > 0 && (
        <div className="space-y-3">

          {/* Attempts Table */}
          <div className="bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Все попытки разгона ({filteredAttempts.length})</span>
                <span className="text-xs text-slate-400 font-normal">
                  • Показаны отфильтрованные ускорения
                </span>
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    const allVisible = filteredAttempts.every(a => visibleAttempts.has(a.id));
                    if (allVisible) {
                      setVisibleAttempts(new Set());
                    } else {
                      setVisibleAttempts(new Set(filteredAttempts.map(a => a.id)));
                    }
                  }}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                    filteredAttempts.every(a => visibleAttempts.has(a.id))
                      ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                      : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                  }`}
                >
                  {filteredAttempts.every(a => visibleAttempts.has(a.id)) ? 'Скрыть все' : 'Показать все'}
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-800/90 border-b border-white/10">
                  <tr>
                    <th className="px-3 py-2 text-left text-slate-300 font-medium">#</th>
                    <th 
                      className="px-3 py-2 text-left text-slate-300 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('thresholdPair')}
                    >
                      Диапазон
                      {sortField === 'thresholdPair' && (
                        <span className="ml-1 text-xs">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                    <th 
                      className="px-3 py-2 text-left text-slate-300 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('time')}
                    >
                      Время
                      {sortField === 'time' && (
                        <span className="ml-1 text-xs">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                    <th 
                      className="px-3 py-2 text-left text-slate-300 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('distance')}
                    >
                      Дистанция
                      {sortField === 'distance' && (
                        <span className="ml-1 text-xs">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                    <th 
                      className="px-3 py-2 text-left text-slate-300 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('peakPower')}
                    >
                      Макс. мощность
                      {sortField === 'peakPower' && (
                        <span className="ml-1 text-xs">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                    <th className="px-3 py-2 text-center text-slate-300 font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAttempts
                    .map((attempt, index) => {
                      const isVisible = visibleAttempts.has(attempt.id);
                      const originalIndex = accelerationAttempts.findIndex(a => a.id === attempt.id);
                      const color = ATTEMPT_COLORS[originalIndex % ATTEMPT_COLORS.length];
                      
                      return (
                        <tr 
                          key={attempt.id}
                          className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                            isVisible ? 'bg-white/[0.02]' : 'opacity-50'
                          }`}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-2 h-2 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: color }}
                              />
                              <span className="text-white font-medium">#{index + 1}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-white font-medium">
                            {attempt.thresholdPair.from.toFixed(1)}-{attempt.thresholdPair.to.toFixed(1)} км/ч
                          </td>
                          <td className="px-3 py-2 text-white">{attempt.time.toFixed(2)}с</td>
                          <td className="px-3 py-2 text-white">{attempt.distance?.toFixed(1) || 'N/A'}м</td>
                          <td className="px-3 py-2 text-white">{attempt.peakPower?.toFixed(0) || 'N/A'}W</td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => toggleAttemptVisibility(attempt.id)}
                              className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                                isVisible
                                  ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                                  : 'bg-slate-600/50 text-slate-400 hover:bg-slate-600/70'
                              }`}
                              title={isVisible ? 'Скрыть с графика' : 'Показать на графике'}
                            >
                              {isVisible ? 'На графике' : 'Показать'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Chart with ChartWithZoom template */}
      {accelerationAttempts.length > 0 && timeRange && (
        <ChartWithZoom
          data={accelerationChartData}
          options={chartOptions}
          height={400}
          timeRange={timeRange}
          timelineMarkers={visibleFilteredAttempts
            .map((attempt) => {
              // Find original index for consistent colors
              const originalIndex = accelerationAttempts.findIndex(a => a.id === attempt.id);
              const timeRangeDuration = timeRange.end - timeRange.start;
              // Ensure position is between 0 and 1, prevent division by zero
              const position = timeRangeDuration > 0 
                ? Math.max(0, Math.min(1, (attempt.time - timeRange.start) / timeRangeDuration))
                : 0.5;
              return {
                id: attempt.id,
                position,
                color: ATTEMPT_COLORS[originalIndex % ATTEMPT_COLORS.length],
                label: `Попытка #${originalIndex + 1}: ${attempt.time.toFixed(2)}с`,
              };
            })}
          timelineLabel="Шкала времени"
          enableMeasurement={true}
        />
      )}

    </div>
  );
});

AccelerationTab.displayName = 'AccelerationTab';
