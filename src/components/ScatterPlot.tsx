import { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import type { TripEntry } from '../types';
import { i18n } from '../i18n';

ChartJS.register(LinearScale, PointElement, Tooltip, Legend);

type MetricKey = 'Speed' | 'Power' | 'Current' | 'PhaseCurrent' | 'Voltage' | 'BatteryLevel' | 'Temperature' | 'PWM' | 'Torque' | 'GPSSpeed';

// Downsample data for mobile performance
function downsampleScatterData(data: TripEntry[], maxPoints: number = 2000): TripEntry[] {
  if (data.length <= maxPoints) return data;
  
  const step = Math.ceil(data.length / maxPoints);
  const result: TripEntry[] = [];
  
  for (let i = 0; i < data.length; i += step) {
    // Use max values in each bucket to preserve peaks
    const bucket = data.slice(i, Math.min(i + step, data.length));
    const maxPowerPoint = bucket.reduce((max, p) => p.Power > max.Power ? p : max, bucket[0]);
    result.push(maxPowerPoint);
  }
  
  return result;
}

interface MetricConfig {
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
}

const METRICS: MetricConfig[] = [
  { key: 'Speed', label: 'Speed', unit: 'km/h', color: '#3b82f6' },
  { key: 'Power', label: 'Power', unit: 'W', color: '#f59e0b' },
  { key: 'Current', label: 'Current', unit: 'A', color: '#ef4444' },
  { key: 'PhaseCurrent', label: 'Phase Current', unit: 'A', color: '#f87171' },
  { key: 'Voltage', label: 'Voltage', unit: 'V', color: '#8b5cf6' },
  { key: 'BatteryLevel', label: 'Battery %', unit: '%', color: '#ec4899' },
  { key: 'Temperature', label: 'Temp', unit: '°C', color: '#f97316' },
  { key: 'PWM', label: 'PWM', unit: '%', color: '#06b6d4' },
  { key: 'Torque', label: 'Torque', unit: '', color: '#a78bfa' },
  { key: 'GPSSpeed', label: 'GPS Speed', unit: 'km/h', color: '#10b981' },
];

// Get color for value based on min/max range (blue -> green -> yellow -> red)
function getColorForValue(value: number, min?: number, max?: number): string {
  if (max === min) return '#3b82f6'; // Default blue
  
  const normalized = Math.max(0, Math.min(1, (value - (min || 0)) / ((max || 1) - (min || 0))));
  
  // Blue (0, 0.4, 0.8) -> Cyan (0, 0.8, 0.8) -> Green (0, 0.8, 0) -> Yellow (0.8, 0.8, 0) -> Red (0.8, 0, 0)
  if (normalized < 0.25) {
    // Blue to Cyan
    const t = normalized / 0.25;
    return `rgb(0, ${Math.round(102 + t * 102)}, ${Math.round(204 + t * 20)})`;
  } else if (normalized < 0.5) {
    // Cyan to Green
    const t = (normalized - 0.25) / 0.25;
    return `rgb(0, ${Math.round(204)}, ${Math.round(224 - t * 224)})`;
  } else if (normalized < 0.75) {
    // Green to Yellow
    const t = (normalized - 0.5) / 0.25;
    return `rgb(${Math.round(t * 204)}, 204, 0)`;
  } else {
    // Yellow to Red
    const t = (normalized - 0.75) / 0.25;
    return `rgb(204, ${Math.round(204 - t * 204)}, 0)`;
  }
}

interface ScatterPlotProps {
  data: TripEntry[];
}

export function ScatterPlot({ data }: ScatterPlotProps) {
  const [xAxis, setXAxis] = useState<MetricKey>('Speed');
  const [yAxis, setYAxis] = useState<MetricKey>('Power');
  const [colorMetric, setColorMetric] = useState<MetricKey>('PhaseCurrent');

  // Detect mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const maxPoints = isMobile ? 1000 : 3000;

  const downsampledData = useMemo(() => downsampleScatterData(data, maxPoints), [data, maxPoints]);

  const availableMetrics = useMemo(() => {
    if (data.length === 0) return METRICS;
    
    return METRICS.filter(m => {
      const firstValue = data[0]?.[m.key as keyof TripEntry];
      return firstValue !== undefined && firstValue !== null;
    });
  }, [data]);

  const scatterData = useMemo(() => {
    if (downsampledData.length === 0) return { datasets: [] };

    const xConfig = METRICS.find(m => m.key === xAxis)!;
    const yConfig = METRICS.find(m => m.key === yAxis)!;
    const colorConfig = METRICS.find(m => m.key === colorMetric)!;

    // Calculate min/max for color normalization
    const colorValues = downsampledData.map(d => Number(d[colorMetric as keyof TripEntry]) || 0);
    const colorMin = Math.min(...colorValues);
    const colorMax = Math.max(...colorValues);

    const points = downsampledData.map(d => ({
      x: Number(d[xAxis as keyof TripEntry]) || 0,
      y: Number(d[yAxis as keyof TripEntry]) || 0,
      colorValue: Number(d[colorMetric as keyof TripEntry]) || 0,
    }));

    return {
      datasets: [{
        label: `${yConfig.label} vs ${xConfig.label}`,
        data: points,
        backgroundColor: points.map(p => getColorForValue(p.colorValue, colorMin, colorMax)),
        borderColor: 'transparent',
        pointRadius: isMobile ? 2 : 3,
        pointHoverRadius: isMobile ? 4 : 6,
      }],
      colorRange: { min: colorMin, max: colorMax, label: colorConfig.label, unit: colorConfig.unit },
    };
  }, [downsampledData, xAxis, yAxis, colorMetric, isMobile]);

  const xConfig = METRICS.find(m => m.key === xAxis)!;
  const yConfig = METRICS.find(m => m.key === yAxis)!;
  const colorConfig = METRICS.find(m => m.key === colorMetric)!;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear' as const,
        position: 'bottom' as const,
        title: {
          display: true,
          text: `${xConfig.label} (${xConfig.unit})`,
          color: 'rgba(255, 255, 255, 0.7)',
          font: { size: 12, weight: 500 as any },
        },
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.5)' },
      },
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        title: {
          display: true,
          text: `${yConfig.label} (${yConfig.unit})`,
          color: 'rgba(255, 255, 255, 0.7)',
          font: { size: 12, weight: 500 as any },
        },
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.5)' },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#fff',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (context: any) => {
            const point = context.raw as { x: number; y: number; colorValue: number };
            return [
              `${xConfig.label}: ${point.x.toFixed(2)} ${xConfig.unit}`,
              `${yConfig.label}: ${point.y.toFixed(2)} ${yConfig.unit}`,
              `${colorConfig.label}: ${point.colorValue.toFixed(2)} ${colorConfig.unit}`,
            ];
          },
        },
      },
    },
  };

  // Generate gradient legend
  const gradientSteps = 5;
  const legendValues = useMemo(() => {
    if (!scatterData.colorRange) return [];
    const { min, max } = scatterData.colorRange;
    return Array.from({ length: gradientSteps }, (_, i) => min + (max - min) * (i / (gradientSteps - 1)));
  }, [scatterData.colorRange]);

  return (
    <div className="space-y-4">
      {/* Axis Selectors */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">{i18n['axisX']}:</span>
          <select
            value={xAxis}
            onChange={(e) => setXAxis(e.target.value as MetricKey)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            title={i18n['axisX']}
          >
            {availableMetrics.map(m => (
              <option key={m.key} value={m.key} className="bg-slate-900">{m.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">{i18n['axisY']}:</span>
          <select
            value={yAxis}
            onChange={(e) => setYAxis(e.target.value as MetricKey)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            title={i18n['axisY']}
          >
            {availableMetrics.map(m => (
              <option key={m.key} value={m.key} className="bg-slate-900">{m.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">{i18n['color']}:</span>
          <select
            value={colorMetric}
            onChange={(e) => setColorMetric(e.target.value as MetricKey)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            title={i18n['colorScale']}
          >
            {availableMetrics.map(m => (
              <option key={m.key} value={m.key} className="bg-slate-900">{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[400px] w-full">
        <Scatter options={options} data={scatterData} />
      </div>

      {/* Color Legend */}
      {scatterData.colorRange && (
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 via-green-500 via-yellow-500 to-red-500" />
              <span className="text-sm font-medium text-white/90">{i18n['color']}</span>
            </div>
            <span className="text-xs text-slate-400">{scatterData.colorRange.label} ({scatterData.colorRange.unit})</span>
          </div>
          <div className="flex items-center gap-1 mb-2">
            {legendValues.map((value, i) => (
              <div
                key={i}
                className="flex-1 h-4 rounded-sm transition-all hover:h-5"
                style={{ backgroundColor: getColorForValue(value, scatterData.colorRange?.min, scatterData.colorRange?.max) }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span className="bg-white/5 px-2 py-1 rounded">{scatterData.colorRange.min.toFixed(1)}</span>
            <span className="bg-white/5 px-2 py-1 rounded">{((scatterData.colorRange.min + scatterData.colorRange.max) / 2).toFixed(1)}</span>
            <span className="bg-white/5 px-2 py-1 rounded">{scatterData.colorRange.max.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
