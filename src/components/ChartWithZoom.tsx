import { memo, useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  type ChartOptions,
  type ChartData,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';
import { downsample } from '../utils/parser';
import { registerChartComponents, clampZoomBounds } from '../utils/chart-shared';

// Register ChartJS components once via shared utility
registerChartComponents();

export interface TimelineMarker {
  id: string;
  position: number; // 0-1 position on timeline
  color: string;
  label?: string;
}

interface ChartWithZoomProps {
  data: ChartData<'line'>;
  options?: ChartOptions<'line'>;
  height?: number;
  timeRange: { start: number; end: number };
  timelineMarkers?: TimelineMarker[];
  timelineLabel?: string;
  onZoomChange?: (zoom: { min: number; max: number } | null) => void;
  className?: string;
  enableMeasurement?: boolean;
}

export const ChartWithZoom = memo(({
  data,
  options,
  height = 400,
  timeRange,
  timelineMarkers = [],
  timelineLabel = 'Шкала времени',
  onZoomChange,
  className = '',
  enableMeasurement = false,
}: ChartWithZoomProps) => {
  // Zoom/pan state
  const [chartZoom, setChartZoom] = useState<{ min: number; max: number } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef<{ x: number; y: number; zoomMin: number; zoomMax: number } | null>(null);

  // Touch state
  const touchState = useRef<{
    initialDistance: number;
    initialZoom: { min: number; max: number } | null;
    lastTouchCount: number;
  }>({ initialDistance: 0, initialZoom: null, lastTouchCount: 0 });

  // Measurement state
  const [measurementMode, setMeasurementMode] = useState(false);
  const [pointA, setPointA] = useState<{ x: number; y: number; valueX: number; valueY: number } | null>(null);
  const [pointB, setPointB] = useState<{ x: number; y: number; valueX: number; valueY: number } | null>(null);
  const chartRef = useRef<any>(null);

  // Calculate distance by integrating speed over time between points
  const calculateDistance = useCallback((pA: { valueX: number }, pB: { valueX: number }, chartData: ChartData<'line'>): number => {
    if (!chartData.datasets || chartData.datasets.length === 0) return 0;

    const startX = Math.min(pA.valueX, pB.valueX);
    const endX = Math.max(pA.valueX, pB.valueX);

    // Use the first dataset to calculate distance (assuming all datasets show speed)
    const dataset = chartData.datasets[0];
    const data = dataset.data as { x: number; y: number }[];

    // Find data points within the range
    const pointsInRange = data.filter(p => p.x >= startX && p.x <= endX);
    if (pointsInRange.length < 2) return 0;

    // Integrate speed over time using trapezoidal rule
    let distance = 0;
    for (let i = 1; i < pointsInRange.length; i++) {
      const p1 = pointsInRange[i - 1];
      const p2 = pointsInRange[i];
      const dt = p2.x - p1.x; // time difference in seconds
      const avgSpeed = (p1.y + p2.y) / 2; // average speed in km/h
      const segmentDistance = (avgSpeed / 3.6) * dt; // convert km/h to m/s, then multiply by time
      distance += segmentDistance;
    }

    return distance;
  }, []);

  // Sync measurement points to chart instance
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.measurementPoints = {
        a: pointA,
        b: pointB,
      };
      chartRef.current.draw('none');
    }
  }, [pointA, pointB]);

  // Handle chart click to set measurement points
  const handleChartClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!enableMeasurement || !measurementMode || !chartRef.current) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert screen coordinates to chart values
    const chart = chartRef.current;
    const xValue = chart.scales.x.getValueForPixel(x);
    const yValue = chart.scales.y.getValueForPixel(y);

    // Set point A first, then point B
    if (!pointA) {
      setPointA({ x, y, valueX: xValue, valueY: yValue });
    } else if (!pointB) {
      setPointB({ x, y, valueX: xValue, valueY: yValue });
    } else {
      // Reset and set new point A
      setPointA({ x, y, valueX: xValue, valueY: yValue });
      setPointB(null);
    }
  }, [enableMeasurement, measurementMode, pointA, pointB]);

  // Reset measurement when mode changes
  useEffect(() => {
    if (!measurementMode) {
      setPointA(null);
      setPointB(null);
    }
  }, [measurementMode]);

  // Notify parent of zoom changes
  useEffect(() => {
    onZoomChange?.(chartZoom);
  }, [chartZoom, onZoomChange]);

  // Downsample data for performance (like App.tsx does)
  const optimizedData = useMemo(() => {
    if (!data.datasets || data.datasets.length === 0) return data;

    const currentTimeRange = chartZoom ? { start: chartZoom.min, end: chartZoom.max } : timeRange;
    const optimizedDatasets = data.datasets.map(dataset => {
      if (!dataset.data || dataset.data.length === 0) return dataset;

      const downsampledData = downsample(
        dataset.data,
        500, // Same limit as App.tsx
        currentTimeRange
      );

      return {
        ...dataset,
        data: downsampledData,
      };
    });

    return {
      ...data,
      datasets: optimizedDatasets,
    };
  }, [data, chartZoom, timeRange]);

  // Mouse handlers for pan
  const handleChartMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      zoomMin: chartZoom?.min ?? timeRange.start,
      zoomMax: chartZoom?.max ?? timeRange.end,
    };
  }, [chartZoom, timeRange]);

  const handleChartMouseMoveRaw = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current || !panStart.current) return;

    const canvas = chartContainerRef.current?.querySelector('canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const deltaX = e.clientX - panStart.current.x;
    const deltaY = e.clientY - panStart.current.y;
    const pxPerUnit = rect.width / (panStart.current.zoomMax - panStart.current.zoomMin);

    // Pan horizontally
    const deltaUnit = -deltaX / pxPerUnit;
    let newMin = panStart.current.zoomMin + deltaUnit;
    let newMax = panStart.current.zoomMax + deltaUnit;

    // Zoom with vertical swipe (up = zoom in, down = zoom out)
    const zoomFactor = 1 + (-deltaY / rect.height) * 0.5;
    const center = (newMin + newMax) / 2;
    const range = (newMax - newMin) * Math.max(0.1, zoomFactor);

    newMin = center - range / 2;
    newMax = center + range / 2;

    const clamped = clampZoomBounds(newMin, newMax, timeRange.start, timeRange.end, 0.5);
    setChartZoom(clamped);
  }, [timeRange]);

  const handleChartMouseMove = useCallback(handleChartMouseMoveRaw, [handleChartMouseMoveRaw]);

  const handleChartMouseUp = useCallback(() => {
    isPanning.current = false;
    panStart.current = null;
  }, []);

  const handleChartMouseLeave = useCallback(() => {
    isPanning.current = false;
    panStart.current = null;
  }, []);

  const handleChartDoubleClick = useCallback(() => {
    setChartZoom(null);
  }, []);

  const handleChartWheelRaw = useCallback((e: React.WheelEvent) => {
    if (!e.shiftKey) return;
    e.preventDefault();

    const canvas = chartContainerRef.current?.querySelector('canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseRatio = mouseX / rect.width;

    const currentMin = chartZoom?.min ?? timeRange.start;
    const currentMax = chartZoom?.max ?? timeRange.end;

    const zoomFactor = 1 + (e.deltaY > 0 ? 0.15 : -0.15);
    const mouseTime = currentMin + (currentMax - currentMin) * mouseRatio;
    let newMin = mouseTime - (mouseTime - currentMin) * zoomFactor;
    let newMax = mouseTime + (currentMax - mouseTime) * zoomFactor;

    const clamped = clampZoomBounds(newMin, newMax, timeRange.start, timeRange.end, 0.5);
    setChartZoom(clamped);
  }, [timeRange, chartZoom]);

  const handleChartWheel = useCallback(handleChartWheelRaw, [handleChartWheelRaw]);

  // Touch handlers for pinch-to-zoom and pan
  const getTouchDistance = useCallback((touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;
    touchState.current.lastTouchCount = touches.length;

    if (touches.length === 2) {
      // Pinch gesture start
      touchState.current.initialDistance = getTouchDistance(touches);
      touchState.current.initialZoom = chartZoom || { min: timeRange.start, max: timeRange.end };
    } else if (touches.length === 1) {
      // Single touch - potential pan
      isPanning.current = true;
      panStart.current = {
        x: touches[0].clientX,
        y: touches[0].clientY,
        zoomMin: chartZoom?.min ?? timeRange.start,
        zoomMax: chartZoom?.max ?? timeRange.end,
      };
    }
  }, [chartZoom, timeRange, getTouchDistance]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 2) {
      // Pinch gesture
      const currentDistance = getTouchDistance(touches);
      const initialDistance = touchState.current.initialDistance;
      const initialZoom = touchState.current.initialZoom;

      if (initialDistance > 0 && initialZoom) {
        const scale = currentDistance / initialDistance;
        const center = (initialZoom.min + initialZoom.max) / 2;
        const range = (initialZoom.max - initialZoom.min) / scale;

        let newMin = center - range / 2;
        let newMax = center + range / 2;

        // Clamp to bounds
        if (newMin < timeRange.start) {
          newMax += (timeRange.start - newMin);
          newMin = timeRange.start;
        }
        if (newMax > timeRange.end) {
          newMin -= (newMax - timeRange.end);
          newMax = timeRange.end;
        }

        // Min range check
        if (newMax - newMin < 0.5) {
          const c = (newMin + newMax) / 2;
          newMin = c - 0.25;
          newMax = c + 0.25;
        }

        // Max range limit
        const totalRange = timeRange.end - timeRange.start;
        if (newMax - newMin > totalRange) {
          newMin = timeRange.start;
          newMax = timeRange.end;
        }

        setChartZoom({ min: newMin, max: newMax });
      }
    } else if (touches.length === 1 && isPanning.current && panStart.current) {
      // Single touch pan
      const canvas = chartContainerRef.current?.querySelector('canvas');
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const deltaX = touches[0].clientX - panStart.current.x;
      const pxPerUnit = rect.width / (panStart.current.zoomMax - panStart.current.zoomMin);
      const deltaUnit = -deltaX / pxPerUnit;

      let newMin = panStart.current.zoomMin + deltaUnit;
      let newMax = panStart.current.zoomMax + deltaUnit;

      // Clamp to bounds
      if (newMin < timeRange.start) {
        newMax += (timeRange.start - newMin);
        newMin = timeRange.start;
      }
      if (newMax > timeRange.end) {
        newMin -= (newMax - timeRange.end);
        newMax = timeRange.end;
      }

      // Min range check
      if (newMax - newMin < 0.5) {
        const c = (newMin + newMax) / 2;
        newMin = c - 0.25;
        newMax = c + 0.25;
      }

      // Max range limit
      const totalRange = timeRange.end - timeRange.start;
      if (newMax - newMin > totalRange) {
        newMin = timeRange.start;
        newMax = timeRange.end;
      }

      setChartZoom({ min: newMin, max: newMax });
    }
  }, [timeRange, getTouchDistance]);

  const handleTouchEnd = useCallback(() => {
    isPanning.current = false;
    panStart.current = null;
    touchState.current.initialDistance = 0;
    touchState.current.initialZoom = null;
    touchState.current.lastTouchCount = 0;
  }, []);

  // Button zoom handlers
  const handleZoomIn = useCallback(() => {
    const currentMin = chartZoom?.min ?? timeRange.start;
    const currentMax = chartZoom?.max ?? timeRange.end;
    const center = (currentMin + currentMax) / 2;
    const currentRange = currentMax - currentMin;
    const newRange = currentRange * 0.7;
    setChartZoom({ min: center - newRange / 2, max: center + newRange / 2 });
  }, [timeRange, chartZoom]);

  const handleZoomOut = useCallback(() => {
    const currentMin = chartZoom?.min ?? timeRange.start;
    const currentMax = chartZoom?.max ?? timeRange.end;
    const center = (currentMin + currentMax) / 2;
    const currentRange = currentMax - currentMin;
    const newRange = currentRange / 0.7;
    let newMin = center - newRange / 2;
    let newMax = center + newRange / 2;

    // Clamp to bounds
    if (newMin < timeRange.start) {
      newMax += (timeRange.start - newMin);
      newMin = timeRange.start;
    }
    if (newMax > timeRange.end) {
      newMin -= (newMax - timeRange.end);
      newMax = timeRange.end;
    }

    const totalRange = timeRange.end - timeRange.start;
    if (newMax - newMin > totalRange) {
      newMin = timeRange.start;
      newMax = timeRange.end;
    }

    setChartZoom({ min: newMin, max: newMax });
  }, [timeRange, chartZoom]);

  const handleResetZoom = useCallback(() => {
    setChartZoom(null);
  }, []);

  // Timeline drag state
  const isTimelineDragging = useRef(false);
  const timelineDragStart = useRef<{ x: number; zoomMin: number; zoomMax: number } | null>(null);

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    isTimelineDragging.current = true;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = clickX / rect.width;
    const clickTime = timeRange.start + (timeRange.end - timeRange.start) * clickRatio;

    const currentMin = chartZoom?.min ?? timeRange.start;
    const currentMax = chartZoom?.max ?? timeRange.end;

    // Check if clicking near edges (within 8px)
    const leftEdgeX = ((currentMin - timeRange.start) / (timeRange.end - timeRange.start)) * rect.width;
    const rightEdgeX = ((currentMax - timeRange.start) / (timeRange.end - timeRange.start)) * rect.width;
    const edgeThreshold = 8;

    if (Math.abs(clickX - leftEdgeX) < edgeThreshold || Math.abs(clickX - rightEdgeX) < edgeThreshold) {
      // Dragging edges - stretch/shrink
      timelineDragStart.current = { x: e.clientX, zoomMin: currentMin, zoomMax: currentMax };
    } else if (clickTime >= currentMin && clickTime <= currentMax) {
      // Panning inside viewport
      timelineDragStart.current = { x: e.clientX, zoomMin: currentMin, zoomMax: currentMax };
    } else {
      // Click outside - center viewport on click
      const currentRange = currentMax - currentMin;
      const halfRange = currentRange / 2;
      setChartZoom({
        min: Math.max(timeRange.start, clickTime - halfRange),
        max: Math.min(timeRange.end, clickTime + halfRange),
      });
      timelineDragStart.current = null;
      isTimelineDragging.current = false;
    }
  }, [timeRange, chartZoom]);

  const handleTimelineMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isTimelineDragging.current || !timelineDragStart.current) return;

    const deltaX = e.clientX - timelineDragStart.current.x;
    const timelineEl = document.querySelector('[data-timeline]');
    if (!timelineEl) return;

    const rect = timelineEl.getBoundingClientRect();
    const pxPerUnit = rect.width / (timeRange.end - timeRange.start);
    const deltaUnit = deltaX / pxPerUnit;

    let newMin = timelineDragStart.current.zoomMin + deltaUnit;
    let newMax = timelineDragStart.current.zoomMax + deltaUnit;

    // Clamp to bounds
    if (newMin < timeRange.start) {
      newMax += (timeRange.start - newMin);
      newMin = timeRange.start;
    }
    if (newMax > timeRange.end) {
      newMin -= (newMax - timeRange.end);
      newMax = timeRange.end;
    }

    // Min range check
    if (newMax - newMin < 0.5) {
      const c = (newMin + newMax) / 2;
      newMin = c - 0.25;
      newMax = c + 0.25;
    }

    setChartZoom({ min: newMin, max: newMax });
  }, [timeRange]);

  const handleTimelineMouseUp = useCallback(() => {
    isTimelineDragging.current = false;
    timelineDragStart.current = null;
  }, []);

  // Merge default options with user options
  const chartOptions = useMemo((): ChartOptions<'line'> => {
    const baseOptions: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
        axis: 'x',
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(148, 163, 184, 0.2)',
          borderWidth: 1,
          callbacks: {
            label: (context: any) => {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += context.parsed.y.toFixed(2);
              }
              return label;
            },
            title: (context: any) => {
              if (context[0] && context[0].parsed.x !== null) {
                return `Время: ${context[0].parsed.x.toFixed(2)} сек`;
              }
              return '';
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear' as const,
          ...(chartZoom && { min: chartZoom.min, max: chartZoom.max }),
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
            callback: (value: string | number) => (typeof value === 'number' ? value.toFixed(1) + 'с' : value),
          },
        },
        y: {
          type: 'linear' as const,
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
          },
        },
      },
    };

    if (!options) return baseOptions;

    // Simple merge - user options override defaults
    return {
      ...baseOptions,
      ...options,
      plugins: {
        ...baseOptions.plugins,
        ...options.plugins,
      },
      scales: {
        x: {
          ...(baseOptions.scales?.x || {}),
          ...((options.scales as unknown as Record<string, unknown>)?.x || {}),
          ...(chartZoom && { min: chartZoom.min, max: chartZoom.max }),
        },
        y: {
          ...(baseOptions.scales?.y || {}),
          ...((options.scales as unknown as Record<string, unknown>)?.y || {}),
        },
      },
    } as ChartOptions<'line'>;
  }, [options, chartZoom]);

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Zoom controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={handleZoomIn}
          className="px-4 py-3 rounded-lg text-sm font-semibold bg-blue-500/20 border border-blue-500/30 text-blue-200 hover:bg-blue-500/30 transition-colors flex items-center gap-2 active:scale-95"
          title="Увеличить масштаб"
        >
          <ZoomIn className="w-5 h-5" />
          <span className="hidden sm:inline">+</span>
        </button>
        <button
          onClick={handleResetZoom}
          className="px-4 py-3 rounded-lg text-sm font-semibold bg-slate-700/50 border border-slate-600 text-slate-400 hover:bg-slate-600 transition-colors flex items-center gap-2 active:scale-95"
          title="Сбросить масштаб"
        >
          <RefreshCw className="w-5 h-5" />
          <span className="hidden sm:inline">Сброс</span>
        </button>
        <button
          onClick={handleZoomOut}
          className="px-4 py-3 rounded-lg text-sm font-semibold bg-slate-700/50 border border-slate-600 text-slate-400 hover:bg-slate-600 transition-colors flex items-center gap-2 active:scale-95"
          title="Уменьшить масштаб"
        >
          <ZoomOut className="w-5 h-5" />
          <span className="hidden sm:inline">-</span>
        </button>
        {enableMeasurement && (
          <>
            <div className="w-px h-6 bg-white/10 mx-1" />
            <button
              onClick={() => setMeasurementMode(!measurementMode)}
              className={`px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 border flex items-center gap-2 active:scale-95 ${
                measurementMode
                  ? 'bg-purple-500/30 border-purple-500/60 text-purple-200'
                  : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700'
              }`}
              title={`Режим замера: ${measurementMode ? 'кликните на график для установки точек А и Б' : 'включить замер расстояния и времени'}`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden sm:inline">Замер</span>
            </button>
            {(pointA || pointB) && (
              <button
                onClick={() => { setPointA(null); setPointB(null); }}
                className="px-4 py-3 rounded-lg text-sm font-semibold bg-red-500/20 border border-red-500/30 text-red-200 hover:bg-red-500/30 transition-colors flex items-center gap-2 active:scale-95"
                title="Очистить точки замера"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </>
        )}
        {chartZoom && (
          <span className="text-xs text-slate-500 ml-2">
            {(chartZoom.max - chartZoom.min).toFixed(1)}с
          </span>
        )}
      </div>

      {/* Measurement results */}
      {pointA && pointB && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg px-4 py-2 text-center">
          <div className="text-xs text-purple-200 font-semibold mb-1">Замер</div>
          <div className="flex items-center justify-center gap-4 text-xs">
            <div>
              <span className="text-slate-400">Время:</span>
              <span className="text-white ml-1 font-mono">{Math.abs(pointB.valueX - pointA.valueX).toFixed(2)}с</span>
            </div>
            <div>
              <span className="text-slate-400">Расстояние:</span>
              <span className="text-white ml-1 font-mono">~{calculateDistance(pointA, pointB, optimizedData).toFixed(1)}м</span>
            </div>
          </div>
        </div>
      )}

      {/* Chart with custom pan/zoom handlers */}
      <div
        ref={chartContainerRef}
        className="relative"
        style={{
          height: `${height}px`,
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
          touchAction: 'none',
        }}
        onMouseDown={handleChartMouseDown}
        onMouseMove={handleChartMouseMove}
        onMouseUp={handleChartMouseUp}
        onMouseLeave={handleChartMouseLeave}
        onDoubleClick={handleChartDoubleClick}
        onWheel={handleChartWheel}
        onClick={handleChartClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Line ref={chartRef} data={optimizedData} options={chartOptions} />
      </div>

      {/* Mini Timeline - matching App.tsx style */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 whitespace-nowrap">{timelineLabel}:</span>
        <div
          data-timeline
          className="flex-1 relative h-5 bg-white/5 rounded overflow-hidden cursor-pointer hover:bg-white/10 transition-colors"
          onMouseDown={handleTimelineMouseDown}
          onMouseMove={handleTimelineMouseMove}
          onMouseUp={handleTimelineMouseUp}
          onMouseLeave={handleTimelineMouseUp}
        >
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 to-purple-900/20" />

          {/* Current viewport with draggable edges */}
          {chartZoom && (
            <>
              <div
                className="absolute top-0 bottom-0 bg-blue-500/30 hover:bg-blue-500/40 transition-colors"
                style={{
                  left: `${((chartZoom.min - timeRange.start) / (timeRange.end - timeRange.start)) * 100}%`,
                  width: `${((chartZoom.max - chartZoom.min) / (timeRange.end - timeRange.start)) * 100}%`,
                }}
              />
              {/* Left edge handle */}
              <div
                className="absolute top-0 bottom-0 w-1.5 bg-blue-400/60 hover:bg-blue-400 cursor-col-resize transition-colors"
                style={{
                  left: `${((chartZoom.min - timeRange.start) / (timeRange.end - timeRange.start)) * 100}%`,
                  transform: 'translateX(-50%)',
                }}
              />
              {/* Right edge handle */}
              <div
                className="absolute top-0 bottom-0 w-1.5 bg-blue-400/60 hover:bg-blue-400 cursor-col-resize transition-colors"
                style={{
                  left: `${((chartZoom.max - timeRange.start) / (timeRange.end - timeRange.start)) * 100}%`,
                  transform: 'translateX(-50%)',
                }}
              />
            </>
          )}

          {/* Markers */}
          {timelineMarkers.map((marker) => (
            <div
              key={marker.id}
              className="absolute w-1 h-full rounded-full"
              style={{
                left: `${marker.position * 100}%`,
                backgroundColor: marker.color,
              }}
              title={marker.label}
            />
          ))}

          {/* Time labels */}
          <div className="absolute inset-0 flex justify-between px-2 items-center text-[9px] text-slate-600 pointer-events-none">
            <span>{timeRange.start.toFixed(1)}с</span>
            <span>{timeRange.end.toFixed(1)}с</span>
          </div>
        </div>
        {/* Reset button */}
        <button
          onClick={() => setChartZoom(null)}
          className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap px-3 py-2 bg-blue-500/10 rounded border border-blue-500/30 hover:bg-blue-500/20 transition-colors active:scale-95"
        >
          Сброс
        </button>
      </div>
    </div>
  );
});

ChartWithZoom.displayName = 'ChartWithZoom';
