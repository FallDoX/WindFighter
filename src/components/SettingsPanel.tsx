import { X, RotateCcw } from 'lucide-react';
import { resetSettings } from '../utils/settings';
import { i18n } from '../i18n';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chartToggles: Record<string, boolean>;
  setChartToggles: (toggles: Record<string, boolean>) => void;
  chartView: 'line' | 'scatter';
  setChartView: (view: 'line' | 'scatter') => void;
  hideIdlePeriods: boolean;
  setHideIdlePeriods: (hide: boolean) => void;
  timeFilter: { startTime: string; endTime: string } | null;
  setTimeFilter: (filter: { startTime: string; endTime: string } | null) => void;
}

const metricLabels: Record<string, string> = {
  speed: i18n['speed'],
  gpsSpeed: i18n['gpsSpeed'],
  power: i18n['power'],
  current: i18n['current'],
  phaseCurrent: i18n['phaseCurrent'],
  voltage: i18n['voltage'],
  batteryLevel: i18n['batteryLevel'],
  temperature: i18n['temperature'],
  temp2: i18n['temp2'],
  torque: i18n['torque'],
  pwm: i18n['pwm'],
};

export function SettingsPanel({
  isOpen,
  onClose,
  chartToggles,
  setChartToggles,
  chartView,
  setChartView,
  hideIdlePeriods,
  setHideIdlePeriods,
  timeFilter,
  setTimeFilter,
}: SettingsPanelProps) {
  const handleTimeFilterChange = (field: 'startTime' | 'endTime', value: string) => {
    const currentFilter = timeFilter || { startTime: '', endTime: '' };
    const newFilter = { ...currentFilter, [field]: value };
    
    // Only apply filter if both fields have values
    if (newFilter.startTime && newFilter.endTime) {
      setTimeFilter(newFilter);
    } else {
      setTimeFilter(null);
    }
  };

  const resetTimeFilter = () => {
    setTimeFilter(null);
  };
  const handleReset = () => {
    if (confirm('Reset all settings to default values?')) {
      resetSettings();
      window.location.reload();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">{i18n['displaySettings']}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
            aria-label={i18n['closeSettings']}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Chart Metrics */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">{i18n['chartMetrics']}</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(metricLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setChartToggles({ ...chartToggles, [key]: !chartToggles[key] })}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border flex items-center gap-2 ${
                    chartToggles[key]
                      ? 'bg-[#3b82f6]/20 border-[#3b82f6]/30 text-[#60a5fa]'
                      : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                  aria-label={`${chartToggles[key] ? i18n['hide'] : i18n['show']} ${label}`}
                >
                  {chartToggles[key] ? '✓' : '○'} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Chart View */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">Тип графика</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setChartView('line')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                  chartView === 'line'
                    ? 'bg-[#3b82f6] border-[#60a5fa] text-white'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
                aria-label={i18n['lineChart']}
              >
                Линейный
              </button>
              <button
                onClick={() => setChartView('scatter')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                  chartView === 'scatter'
                    ? 'bg-[#3b82f6] border-[#60a5fa] text-white'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
                aria-label={i18n['scatterChart']}
              >
                Точечный
              </button>
            </div>
          </div>

          {/* Time Filter */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">{i18n['timeFilter']}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">{i18n['startTime']}</label>
                <input
                  type="datetime-local"
                  value={timeFilter?.startTime || ''}
                  onChange={(e) => handleTimeFilterChange('startTime', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800/50 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">{i18n['endTime']}</label>
                <input
                  type="datetime-local"
                  value={timeFilter?.endTime || ''}
                  onChange={(e) => handleTimeFilterChange('endTime', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-slate-800/50 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (timeFilter?.startTime && timeFilter?.endTime) {
                      setTimeFilter(timeFilter);
                    }
                  }}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border bg-blue-500/20 border-blue-500/40 text-blue-200 hover:bg-blue-500/30"
                >
                  {i18n['applyTimeFilter']}
                </button>
                <button
                  onClick={resetTimeFilter}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800"
                >
                  {i18n['resetTimeFilter']}
                </button>
              </div>
            </div>
          </div>

          {/* Hide Idle Periods */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">{i18n['additional']}</h3>
            <button
              onClick={() => setHideIdlePeriods(!hideIdlePeriods)}
              className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border flex items-center justify-center gap-2 ${
                hideIdlePeriods
                  ? 'bg-[#3b82f6] border-[#60a5fa] text-white'
                  : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800'
              }`}
              aria-label={`${hideIdlePeriods ? i18n['show'] : i18n['hide']} ${i18n['idlePeriods']}`}
            >
              {hideIdlePeriods ? '✓' : '○'} {hideIdlePeriods ? i18n['show'] : i18n['hide']} {i18n['idlePeriods']}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={handleReset}
            className="w-full px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center gap-2"
            aria-label={i18n['resetSettings']}
          >
            <RotateCcw className="w-4 h-4" />
            Сбросить настройки
          </button>
        </div>
      </div>
    </div>
  );
}
