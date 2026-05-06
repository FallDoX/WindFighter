import React, { memo } from 'react';
import { ChevronDown, ChevronRight, Gauge, TrendingUp, Clock, Zap, Battery, Thermometer, Activity, Upload, Share2 } from 'lucide-react';
import { i18n } from '../i18n';
import type { TripSummary } from '../types';


// Table row component props
interface StatRowProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  unit?: string;
  tooltip?: string;
}

// Simple table row component
const StatRow = memo(({ title, value, icon: Icon, unit, tooltip }: StatRowProps) => (
  <div
    title={tooltip || `${title}: ${value}${unit ? ' ' + unit : ''}`}
    className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 hover:bg-white/5 transition-colors group"
  >
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <Icon className="w-3 h-3 text-white/60 flex-shrink-0" strokeWidth={2} />
      <span className="text-xs text-white/70 truncate">{title}</span>
    </div>
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <span className="text-xs font-semibold text-white">{value}</span>
      {unit && <span className="text-[10px] text-white/50 ml-0.5">{unit}</span>}
    </div>
  </div>
));

StatRow.displayName = 'StatRow';

interface TripOverviewProps {
  summary: TripSummary;
  visibleMetrics: Record<string, boolean>;
  onVisibleMetricsChange: (key: string) => void;
  onHideAll: () => void;
  onFileLoad: () => void;
  onShare: () => Promise<void>;
}

export function TripOverview({ summary, visibleMetrics, onFileLoad, onShare }: TripOverviewProps) {
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({});

  // Обработчик для сворачивания всех секций
  React.useEffect(() => {
    const handleCollapseAll = () => {
      setCollapsedSections({
        speed: true,
        distanceTime: true,
        power: true,
        battery: true,
        temperature: true,
        data: true
      });
    };

    window.addEventListener('collapseAllSections', handleCollapseAll);
    return () => window.removeEventListener('collapseAllSections', handleCollapseAll);
  }, []);

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    if (hours > 0) return `${hours}ч ${minutes}м`;
    if (minutes > 0) return `${minutes}м ${seconds}с`;
    return `${seconds}с`;
  };

  return (
    <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-xl border border-white/10 p-3 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-bold text-white">{i18n['tripTelemetry']}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onFileLoad}
            className="flex items-center gap-1 px-2 py-1 rounded transition-all duration-200 border bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 text-xs"
            title={i18n['uploadPrompt']}
          >
            <Upload className="w-3 h-3" strokeWidth={2} />
            <span className="hidden sm:inline">{i18n['uploadCSV']}</span>
          </button>
          <button
            onClick={onShare}
            className="flex items-center gap-1 px-2 py-1 rounded transition-all duration-200 border bg-purple-500/20 border-purple-500/40 text-purple-200 hover:bg-purple-500/30 text-xs"
            title={i18n['shareTitle']}
          >
            <Share2 className="w-3 h-3" strokeWidth={2} />
            <span className="hidden sm:inline">{i18n['share']}</span>
          </button>
                  </div>
      </div>

      
      <div className="space-y-1">
        {/* Speed Metrics Section */}
        {(visibleMetrics.maxSpeed || visibleMetrics.avgSpeed || visibleMetrics.avgMovingSpeed) && (
          <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => toggleSection('speed')}
              className="w-full px-2 py-1 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Gauge className="w-3 h-3 text-blue-400 flex-shrink-0" />
                <span className="truncate">Скорость</span>
              </span>
              {collapsedSections.speed ? <ChevronRight className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
            </button>
            {!collapsedSections.speed && (
              <div className="border-t border-white/5">
                {visibleMetrics.maxSpeed && summary.maxSpeed > 0 && (
                  <StatRow
                    title={i18n['maxSpeed']}
                    value={summary.maxSpeed.toFixed(1)}
                    unit="km/h"
                    icon={Gauge}
                                        tooltip="Максимальная скорость достигнутая во время поездки"
                  />
                )}
                {visibleMetrics.avgSpeed && summary.avgSpeed > 0 && (
                  <StatRow
                    title={i18n['avgSpeed']}
                    value={summary.avgSpeed.toFixed(1)}
                    unit="km/h"
                    icon={Gauge}
                                        tooltip="Средняя скорость за всё время поездки (включая стоянки)"
                  />
                )}
                {visibleMetrics.avgMovingSpeed && summary.avgMovingSpeed > 0 && (
                  <StatRow
                    title={i18n['avgMovingSpeed']}
                    value={summary.avgMovingSpeed.toFixed(1)}
                    unit="km/h"
                    icon={Gauge}
                                        tooltip="Средняя скорость только во время движения (скорость >5 км/ч)"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Distance & Time Section */}
        {(visibleMetrics.distance || visibleMetrics.duration || visibleMetrics.ridingTime) && (
          <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => toggleSection('distanceTime')}
              className="w-full px-2 py-1 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-green-400" />
                Расстояние и время
              </span>
              {collapsedSections.distanceTime ? <ChevronRight className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
            </button>
            {!collapsedSections.distanceTime && (
              <div className="border-t border-white/5">
                {visibleMetrics.distance && summary.totalDistance > 0 && (
                  <StatRow
                    title={i18n['distance']}
                    value={summary.totalDistance.toFixed(2)}
                    unit="km"
                    icon={TrendingUp}
                    tooltip="Общее расстояние пройденное за поездку"
                  />
                )}
                {visibleMetrics.duration && summary.duration > 0 && (
                  <StatRow
                    title={i18n['duration']}
                    value={formatDuration(summary.duration)}
                    unit=""
                    icon={Clock}
                    tooltip="Общее время поездки от старта до финиша"
                  />
                )}
                {visibleMetrics.ridingTime && summary.movingDuration > 0 && (
                  <StatRow
                    title={i18n['ridingTime']}
                    value={formatDuration(summary.movingDuration)}
                    unit=""
                    icon={Clock}
                    tooltip="Чистое время в движении (без стоянок)"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Power & Current Section */}
        {(visibleMetrics.maxPower || visibleMetrics.maxTorque || visibleMetrics.maxPhaseCurrent) && (
          <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => toggleSection('power')}
              className="w-full px-2 py-1 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                <Zap className="w-3 h-3 text-yellow-400" />
                Мощность и ток
              </span>
              {collapsedSections.power ? <ChevronRight className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
            </button>
            {!collapsedSections.power && (
              <div className="border-t border-white/5">
                {visibleMetrics.maxPower && summary.maxPower > 0 && (
                  <StatRow
                    title={i18n['maxPower']}
                    value={summary.maxPower.toFixed(0)}
                    unit="W"
                    icon={Zap}
                    tooltip="Максимальная потребляемая мощность в Ваттах"
                  />
                )}
                {visibleMetrics.maxTorque && summary.maxTorque !== undefined && summary.maxTorque > 0 && (
                  <StatRow
                    title={i18n['maxTorque']}
                    value={summary.maxTorque.toFixed(2)}
                    unit=""
                    icon={Zap}
                    tooltip="Максимальный крутящий момент двигателя в Н·м"
                  />
                )}
                {visibleMetrics.maxPhaseCurrent && summary.maxPhaseCurrent !== undefined && summary.maxPhaseCurrent > 0 && (
                  <StatRow
                    title={i18n['maxPhaseI']}
                    value={summary.maxPhaseCurrent.toFixed(1)}
                    unit="A"
                    icon={Zap}
                    tooltip="Максимальный фазный ток двигателя в Амперах"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Battery Section */}
        {(visibleMetrics.batteryDrop || visibleMetrics.maxBatteryDrop) && (
          <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => toggleSection('battery')}
              className="w-full px-2 py-1 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                <Battery className="w-3 h-3 text-pink-400" />
                Батарея
              </span>
              {collapsedSections.battery ? <ChevronRight className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
            </button>
            {!collapsedSections.battery && (
              <div className="border-t border-white/5">
                {visibleMetrics.batteryDrop && (
                  <StatRow
                    title={i18n['batteryDrop']}
                    value={summary.batteryDrop}
                    unit="%"
                    icon={Battery}
                    tooltip="Общий разряд батареи: разница между зарядом в начале и конце поездки"
                  />
                )}
                {visibleMetrics.maxBatteryDrop && summary.maxBatteryDrop !== undefined && summary.maxBatteryDrop > 0 && (
                  <StatRow
                    title={i18n['maxBatteryDrop']}
                    value={summary.maxBatteryDrop.toFixed(1)}
                    unit="%"
                    icon={Battery}
                    tooltip="Максимальная просадка от пика: наибольшее падение заряда от максимального уровня во время поездки"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Temperature Section */}
        {(visibleMetrics.avgTemp || visibleMetrics.maxTemp) && (
          <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => toggleSection('temperature')}
              className="w-full px-2 py-1 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                <Thermometer className="w-3 h-3 text-orange-400" />
                Температура
              </span>
              {collapsedSections.temperature ? <ChevronRight className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
            </button>
            {!collapsedSections.temperature && (
              <div className="border-t border-white/5">
                {visibleMetrics.avgTemp && summary.avgTemp !== undefined && summary.avgTemp > 0 && (
                  <StatRow
                    title={i18n['avgTemp']}
                    value={summary.avgTemp.toFixed(1)}
                    unit="°C"
                    icon={Thermometer}
                    tooltip="Средняя температура контроллера за поездку"
                  />
                )}
                {visibleMetrics.maxTemp && summary.maxTemp !== undefined && summary.maxTemp > 0 && (
                  <StatRow
                    title={i18n['maxTemp']}
                    value={summary.maxTemp.toFixed(1)}
                    unit="°C"
                    icon={Thermometer}
                    tooltip="Максимальная температура контроллера достигнутая во время поездки"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Data Section */}
        {visibleMetrics.totalSamples && (
          <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => toggleSection('data')}
              className="w-full px-2 py-1 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                <Activity className="w-3 h-3 text-slate-400" />
                Данные
              </span>
              {collapsedSections.data ? <ChevronRight className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
            </button>
            {!collapsedSections.data && (
              <div className="p-1.5 border-t border-white/5">
                <StatRow
                  title={i18n['totalSamples']}
                  value="N/A"
                  unit=""
                  icon={Activity}
                  tooltip="Общее количество точек данных в загруженном файле"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
