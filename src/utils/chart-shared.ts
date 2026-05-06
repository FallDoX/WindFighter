import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
} from 'chart.js';
import type { TripEntry } from '../types';

// ── Shared Color Palette ──────────────────────────────────────────
export const ATTEMPT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#f97316', '#06b6d4', '#a78bfa', '#fb923c',
];

export const PRESET_COLORS: Record<string, string> = {
  '0-25': '#3b82f6',
  '0-60': '#10b981',
  '0-90': '#f59e0b',
  '0-100': '#ef4444',
  'custom': '#8b5cf6',
};

export const ACCELERATION_PRESETS = [
  { id: '0-25', from: 0, to: 25, label: '0-25' },
  { id: '0-60', from: 0, to: 60, label: '0-60' },
  { id: '0-90', from: 0, to: 90, label: '0-90' },
  { id: '0-100', from: 0, to: 100, label: '0-100' },
  { id: 'custom', from: -1, to: -1, label: 'Все' },
];

// ── Vertical Cursor Plugin (shared between App.tsx and ChartWithZoom.tsx) ──
export const verticalCursorPlugin = {
  id: 'verticalCursor',
  afterInit: (chart: any) => {
    chart.verticalCursor = { x: null, visible: false, lastX: null };
    chart.measurementPoints = { a: null, b: null };
  },
  afterEvent: (chart: any, args: any) => {
    if (!chart.verticalCursor) {
      chart.verticalCursor = { x: null, visible: false, lastX: null };
    }
    if (!chart.measurementPoints) {
      chart.measurementPoints = { a: null, b: null };
    }
    if (args.event.x && args.event.type === 'mousemove') {
      const newX = args.event.x;
      if (newX !== chart.verticalCursor.lastX) {
        chart.verticalCursor.x = newX;
        chart.verticalCursor.lastX = newX;
        chart.verticalCursor.visible = true;
        chart.draw('none');
      }
    } else if (args.event.type === 'mouseout') {
      if (chart.verticalCursor.visible) {
        chart.verticalCursor.visible = false;
        chart.draw('none');
      }
    }
  },
  afterDraw: (chart: any) => {
    const ctx = chart.ctx;
    const chartArea = chart.chartArea;

    if (!chart.verticalCursor || !chart.verticalCursor.visible || chart.verticalCursor.x === null) return;

    const x = chart.verticalCursor.x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.restore();

    // Draw measurement points
    if (chart.measurementPoints) {
      const { a, b } = chart.measurementPoints;
      if (a) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(a.x, a.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 68, 68, 1)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.fillText('A', a.x - 4, a.y - 10);
        ctx.restore();
      }
      if (b) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(59, 130, 246, 1)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#3b82f6';
        ctx.fillText('B', b.x - 4, b.y - 10);
        ctx.restore();
      }
      if (a && b) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.restore();
      }
    }
  },
};

// ── Register ChartJS components once ───────────────────────────────
let _registered = false;
export function registerChartComponents() {
  if (_registered) return;
  _registered = true;
  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    TimeScale,
    Filler,
    verticalCursorPlugin,
  );
}

// ── Zoom bounds clamping (deduplicated from 8+ locations) ─────────
export function clampZoomBounds(
  newMin: number,
  newMax: number,
  rangeStart: number,
  rangeEnd: number,
  minRange = 1000,
): { min: number; max: number } {
  const totalRange = rangeEnd - rangeStart;

  // Clamp to data bounds
  if (newMin < rangeStart) {
    newMax += (rangeStart - newMin);
    newMin = rangeStart;
  }
  if (newMax > rangeEnd) {
    newMin -= (newMax - rangeEnd);
    newMax = rangeEnd;
  }

  // Min range
  if (newMax - newMin < minRange) {
    const c = (newMin + newMax) / 2;
    newMin = c - minRange / 2;
    newMax = c + minRange / 2;
  }

  // Max range
  if (newMax - newMin > totalRange) {
    newMin = rangeStart;
    newMax = rangeEnd;
  }

  return { min: newMin, max: newMax };
}

// ── Info bar data builder (deduplicated from App.tsx) ──────────────
export function buildInfoBarData(dataPoint: TripEntry) {
  return [
    { label: 'Скорость', value: dataPoint.Speed, color: '#3b82f6', unit: 'км/ч' },
    { label: 'GPS', value: dataPoint.GPSSpeed, color: '#10b981', unit: 'км/ч' },
    { label: 'Мощность', value: dataPoint.Power, color: '#f59e0b', unit: 'Вт' },
    { label: 'Ток', value: dataPoint.Current, color: '#ef4444', unit: 'А' },
    { label: 'Напряжение', value: dataPoint.Voltage, color: '#8b5cf6', unit: 'В' },
    { label: 'Батарея', value: dataPoint.BatteryLevel, color: '#ec4899', unit: '%' },
    { label: 'Темп', value: dataPoint.Temperature, color: '#f97316', unit: '°C' },
    { label: 'PWM', value: dataPoint.PWM, color: '#06b6d4', unit: '%' },
  ];
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
