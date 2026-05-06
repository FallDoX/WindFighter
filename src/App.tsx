import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
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
  Filler
} from 'chart.js';
import { parseTripData, calculateSummary, downsample, filterData, defaultFilterConfig, type DataFilterConfig } from './utils/parser';
import { loadSettings, saveSettings } from './utils/settings';
import type { TripEntry, TripSummary } from './types';
import { AccelerationTab } from './components/AccelerationTab';
import { SettingsPanel } from './components/SettingsPanel';
import { GPSMap } from './components/GPSMap';
import {
  Activity, Clock, Settings, Eye, EyeOff, ZoomIn, ZoomOut, Play, Upload, BarChart, Lock, Unlock, ChevronRight, ChevronDown, MapPin
} from 'lucide-react';
import { throttle } from './utils/performance';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toPng } from 'html-to-image';
import { ScatterPlot } from './components/ScatterPlot';
import { TripOverview } from './components/TripOverview';
import { i18n } from './i18n';
import { useChartOptions } from './hooks/useChartOptions';
import { useChartState } from './hooks/useChartState';
import useAccelerationState from './hooks/useAccelerationState';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Vertical cursor line plugin for chart hover - optimized for performance
const verticalCursorPlugin = {
  id: 'verticalCursor',
  afterInit: (chart: { verticalCursor?: { x: number | null; visible: boolean; lastX: number | null } }) => {
    chart.verticalCursor = { x: null, visible: false, lastX: null };
  },
  afterEvent: (chart: { verticalCursor?: { x: number | null; visible: boolean; lastX: number | null } }, args: { event: { type: string } }) => {
    // Safety check - ensure verticalCursor exists
    if (!chart.verticalCursor) {
      chart.verticalCursor = { x: null, visible: false, lastX: null };
    }

    const { event } = args;
    if (event.type === 'mousemove') {
      const points = (chart as { getElementsAtEventForMode: Function }).getElementsAtEventForMode(event, 'index', { intersect: false }, true);
      if (points.length) {
        const newX = points[0].element.x;
        // Only update if position changed significantly (>2px)
        if (Math.abs(newX - (chart.verticalCursor.lastX || 0)) > 2) {
          chart.verticalCursor.x = newX;
          chart.verticalCursor.lastX = newX;
          chart.verticalCursor.visible = true;
          (chart as { draw: (mode?: string) => void }).draw('none'); // Use 'none' mode for better performance
        }
      }
    } else if (event.type === 'mouseout') {
      chart.verticalCursor.visible = false;
      (chart as { draw: (mode?: string) => void }).draw('none');
    }
  },
  afterDraw: (chart: { verticalCursor?: { x: number | null; visible: boolean; lastX: number | null }; ctx: CanvasRenderingContext2D; chartArea: { top: number; bottom: number } }) => {
    // Safety check - ensure verticalCursor exists and is visible
    if (!chart.verticalCursor || !chart.verticalCursor.visible || chart.verticalCursor.x === null) return;

    const ctx = chart.ctx;
    const { top, bottom } = chart.chartArea;
    const x = chart.verticalCursor.x;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.restore();
  }
};

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
  verticalCursorPlugin
);

// Modern toggle chip
interface ToggleChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
}

const ToggleChip = memo(({ label, active, onClick, color = "primary" }: ToggleChipProps) => {
  // Unified 6-color palette
  const colorMap: Record<string, string> = {
    primary: "bg-[#3b82f6]/20 border-[#3b82f6]/30 text-[#60a5fa]",
    success: "bg-[#10b981]/20 border-[#10b981]/30 text-[#34d399]",
    warning: "bg-[#f59e0b]/20 border-[#f59e0b]/30 text-[#fbbf24]",
    danger: "bg-[#ef4444]/20 border-[#ef4444]/30 text-[#f87171]",
    info: "bg-[#8b5cf6]/20 border-[#8b5cf6]/30 text-[#a78bfa]",
    accent: "bg-[#06b6d4]/20 border-[#06b6d4]/30 text-[#22d3ee]",
  };

  const activeMap: Record<string, string> = {
    primary: "bg-[#3b82f6] border-[#60a5fa] text-white",
    success: "bg-[#10b981] border-[#34d399] text-white",
    warning: "bg-[#f59e0b] border-[#fbbf24] text-white",
    danger: "bg-[#ef4444] border-[#f87171] text-white",
    info: "bg-[#8b5cf6] border-[#a78bfa] text-white",
    accent: "bg-[#06b6d4] border-[#22d3ee] text-white",
  };

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${active ? 'Скрыть' : 'Показать'} ${label}`}
      className={cn(
        "px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 border flex items-center gap-1.5",
        active ? activeMap[color] : colorMap[color],
        "hover:opacity-80"
      )}
    >
      {active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      {label}
    </button>
  );
});

function App() {
  interface FileDataset {
    id: string;
    name: string;
    data: TripEntry[];
    summary: TripSummary | null;
    timeRange: { start: number; end: number } | null;
  }

  const [datasets, setDatasets] = useState<FileDataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [data, setData] = useState<TripEntry[]>([]);
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showTelemetryToggles, setShowTelemetryToggles] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Time range state
  const [timeRange, setTimeRange] = useState<{ start: number; end: number } | null>(null);

  // Visibility toggles for metrics
  const [visibleMetrics, setVisibleMetrics] = useState<Record<string, boolean>>({
    maxSpeed: true,
    distance: true,
    maxPower: true,
    batteryDrop: true,
    batteryVoltageDrop: true,
    maxBatteryDrop: true,
    avgTemp: true,
    duration: false,
    ridingTime: true,
    avgSpeed: true,
    avgMovingSpeed: true,
    totalSamples: false,
    maxTorque: true,
    maxPhaseCurrent: true,
    maxTemp: false,
  });

  // Acceleration state - extracted to useAccelerationState hook
  const { accelerationAttempts, clearSettings } = useAccelerationState(data);

  
  // Collapsed sections state
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({
    acceleration: false,
    comparison: false,
  });

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Chart state from custom hook
  const {
    chartToggles,
    setChartToggles,
    chartSnapMode,
    setChartSnapMode,
    chartZoom,
    setChartZoom,
    chartView,
    setChartView,
    isPanning,
    panStart,
    resetZoom,
  } = useChartState();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if GPS data is available
  const hasGPSData = useMemo(() => {
    return data.length > 0 && data.some(entry => entry.Latitude !== undefined && entry.Longitude !== undefined);
  }, [data]);

  // Panels visibility
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // Unified settings dropdown state
  const [showUnifiedSettings, setShowUnifiedSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'processing' | 'visualization'>('processing');

  // Time filter state
  const [timeFilter, setTimeFilter] = useState<{ startTime: string; endTime: string } | null>(null);

  
  // Current time for GPS map sync
  const [currentTime, setCurrentTime] = useState<number | undefined>(undefined);
  const [filterConfig, setFilterConfig] = useState<DataFilterConfig>(defaultFilterConfig);
  const [hideIdlePeriods, setHideIdlePeriods] = useState<boolean>(false);

  // Info bar state
  const [_showInfoBar, setShowInfoBar] = useState(false);
  const [infoBarFrozen, setInfoBarFrozen] = useState(false);
  const [_infoBarData, setInfoBarData] = useState<Array<{ label: string; value: number | null; color: string; unit: string }>>([]);
  const [_infoBarTimestamp, setInfoBarTimestamp] = useState<string>('');

  // Load settings from localStorage on mount
  useEffect(() => {
    const settings = loadSettings();
    
    // Apply chart toggles if available
    if (settings.chartToggles) {
      setChartToggles(settings.chartToggles);
    }
    
    // Apply hideIdlePeriods if available
    if (settings.hideIdlePeriods !== undefined) {
      setHideIdlePeriods(settings.hideIdlePeriods);
    }
    
    // Apply chartView if available
    if (settings.chartView) {
      setChartView(settings.chartView);
    }
  }, [setChartToggles, setChartView]);

  // Auto-save settings when they change
  useEffect(() => {
    const settingsToSave = {
      chartToggles,
      hideIdlePeriods,
      chartView,
    };
    saveSettings(settingsToSave);
  }, [chartToggles, hideIdlePeriods, chartView]);

  // Filter data by time range AND apply data quality filter AND optionally hide idle periods
  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    
    // First apply time range filter
    let timeFiltered = data;
    if (timeRange) {
      timeFiltered = data.filter(e => e.timestamp >= timeRange.start && e.timestamp <= timeRange.end);
    }
    
    // Then apply data quality filter
    const result = filterData(timeFiltered, filterConfig);
    let filtered = result.filtered;
    
    // Optionally remove long idle periods (speed < 5 km/h for > 30 seconds)
    if (hideIdlePeriods) {
      const IDLE_THRESHOLD_KMH = 5;
      const IDLE_TIME_THRESHOLD_MS = 30000; // 30 seconds

      // First, identify all idle periods
      const idlePeriods: { start: number; end: number }[] = [];
      let idleStartIndex: number | null = null;

      for (let i = 0; i < filtered.length; i++) {
        if (filtered[i].Speed < IDLE_THRESHOLD_KMH) {
          if (idleStartIndex === null) {
            idleStartIndex = i;
          }
        } else {
          if (idleStartIndex !== null) {
            const idleDuration = filtered[i].timestamp - filtered[idleStartIndex].timestamp;
            if (idleDuration >= IDLE_TIME_THRESHOLD_MS) {
              idlePeriods.push({
                start: filtered[idleStartIndex].timestamp,
                end: filtered[i].timestamp
              });
            }
            idleStartIndex = null;
          }
        }
      }

      // Check for trailing idle period
      if (idleStartIndex !== null) {
        const idleDuration = filtered[filtered.length - 1].timestamp - filtered[idleStartIndex].timestamp;
        if (idleDuration >= IDLE_TIME_THRESHOLD_MS) {
          idlePeriods.push({
            start: filtered[idleStartIndex].timestamp,
            end: filtered[filtered.length - 1].timestamp
          });
        }
      }

      // Filter out entries that fall within idle periods
      filtered = filtered.filter(entry => {
        for (const period of idlePeriods) {
          if (entry.timestamp >= period.start && entry.timestamp <= period.end) {
            return false;
          }
        }
        return true;
      });
    }
    
    return filtered;
  }, [data, timeRange, filterConfig, hideIdlePeriods]);

  // Compute active periods (non-idle segments) for collapsed timeline view
  const activePeriods = useMemo(() => {
    if (!hideIdlePeriods || filteredData.length === 0) return null;
    
    const periods: { start: number; end: number }[] = [];
    let currentStart: number | null = null;
    
    for (let i = 0; i < filteredData.length; i++) {
      const entry = filteredData[i];
      const prevEntry = i > 0 ? filteredData[i - 1] : null;
      
      // Start of a new period
      if (currentStart === null) {
        currentStart = entry.timestamp;
      }
      
      // Check if there's a gap (idle period was removed)
      if (prevEntry && entry.timestamp - prevEntry.timestamp > 5000) { // 5 second gap threshold
        periods.push({ start: currentStart, end: prevEntry.timestamp });
        currentStart = entry.timestamp;
      }
    }
    
    // Close the last period
    if (currentStart !== null && filteredData.length > 0) {
      periods.push({ start: currentStart, end: filteredData[filteredData.length - 1].timestamp });
    }
    
    return periods;
  }, [filteredData, hideIdlePeriods]);

  // Calculate collapsed timeline range (total active time only)
  const collapsedTimeRange = useMemo(() => {
    if (!hideIdlePeriods || !activePeriods || activePeriods.length === 0) return null;
    
    const totalActiveDuration = activePeriods.reduce((sum, p) => sum + (p.end - p.start), 0);
    return {
      start: 0,
      end: totalActiveDuration,
      periods: activePeriods,
    };
  }, [activePeriods, hideIdlePeriods]);

  // Calculate compressed time range based on filtered data (when filters are active)
  const compressedTimeRange = useMemo(() => {
    // Use compressed range when hideIdlePeriods is active or when data was filtered
    const isFiltered = hideIdlePeriods || (filterConfig !== defaultFilterConfig);
    
    if (!isFiltered || filteredData.length === 0) return null;
    
    const timestamps = filteredData.map(e => e.timestamp);
    return {
      start: Math.min(...timestamps),
      end: Math.max(...timestamps),
    };
  }, [filteredData, hideIdlePeriods, filterConfig]);

  // Recompute summary for filtered data
  const filteredSummary = useMemo(() => {
    if (filteredData.length === 0) return null;
    return calculateSummary(filteredData);
  }, [filteredData]);

  // Update time range when data changes
  useEffect(() => {
    if (data.length > 0 && !timeRange) {
      const timestamps = data.map(e => e.timestamp);
      setTimeRange({
        start: Math.min(...timestamps),
        end: Math.max(...timestamps),
      });
    }
  }, [data, timeRange]);

  // Optimized data for charts - aggressive downsampling for performance
  const displayData = useMemo(() => {
    const currentTimeRange = chartZoom ? { start: chartZoom.min, end: chartZoom.max } : (compressedTimeRange || timeRange);
    return downsample(filteredData, 500, currentTimeRange);
  }, [filteredData, chartZoom, timeRange, compressedTimeRange]);

  // Interactive chart handlers
  const handleChartMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    isPanning.current = true;
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      zoomMin: chartZoom?.min ?? (timeRange?.start ?? 0),
      zoomMax: chartZoom?.max ?? (timeRange?.end ?? 0),
    };
  }, [chartZoom, timeRange]);

  const handleChartMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current || !panStart.current || !timeRange) return;

    const canvas = chartContainerRef.current?.querySelector('canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const deltaX = e.clientX - panStart.current.x;
    const deltaY = e.clientY - panStart.current.y;
    const pxPerMs = rect.width / (panStart.current.zoomMax - panStart.current.zoomMin);

    // Pan horizontally
    const deltaMs = -deltaX / pxPerMs;
    let newMin = panStart.current.zoomMin + deltaMs;
    let newMax = panStart.current.zoomMax + deltaMs;

    // Zoom with vertical swipe (up = zoom in, down = zoom out)
    const zoomFactor = 1 + (-deltaY / rect.height) * 0.5;
    const center = (newMin + newMax) / 2;
    const range = (newMax - newMin) * Math.max(0.1, zoomFactor);

    newMin = center - range / 2;
    newMax = center + range / 2;

    // Clamp to time range bounds
    if (newMin < timeRange.start) {
      newMax += (timeRange.start - newMin);
      newMin = timeRange.start;
    }
    if (newMax > timeRange.end) {
      newMin -= (newMax - timeRange.end);
      newMax = timeRange.end;
    }

    // Min range 1 second
    if (newMax - newMin < 1000) {
      const c = (newMin + newMax) / 2;
      newMin = c - 500;
      newMax = c + 500;
    }

    // Max range limit (prevent zoom out beyond data bounds)
    const totalRange = timeRange.end - timeRange.start;
    if (newMax - newMin > totalRange) {
      newMin = timeRange.start;
      newMax = timeRange.end;
    }

    setChartZoom({ min: newMin, max: newMax });
  }, [timeRange]);

  const handleChartMouseUp = useCallback(() => {
    isPanning.current = false;
    panStart.current = null;
  }, []);

  // Timeline interaction state
  const isTimelineDragging = useRef(false);
  const timelineDragMode = useRef<'pan' | 'left' | 'right' | null>(null);
  const timelineDragStart = useRef<{ x: number; zoomMin: number; zoomMax: number } | null>(null);

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    if (!timeRange) return;
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

    if (Math.abs(clickX - leftEdgeX) < edgeThreshold) {
      // Dragging left edge
      timelineDragMode.current = 'left';
      timelineDragStart.current = { x: e.clientX, zoomMin: currentMin, zoomMax: currentMax };
    } else if (Math.abs(clickX - rightEdgeX) < edgeThreshold) {
      // Dragging right edge
      timelineDragMode.current = 'right';
      timelineDragStart.current = { x: e.clientX, zoomMin: currentMin, zoomMax: currentMax };
    } else if (clickTime >= currentMin && clickTime <= currentMax) {
      // Panning inside viewport
      timelineDragMode.current = 'pan';
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
      timelineDragMode.current = null;
    }
  }, [timeRange, chartZoom]);

  const handleTimelineMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isTimelineDragging.current || !timelineDragStart.current || !timeRange) return;

    const deltaX = e.clientX - timelineDragStart.current.x;
    const timelineEl = document.querySelector('[data-timeline]');
    if (!timelineEl) return;

    const rect = timelineEl.getBoundingClientRect();
    const pxPerMs = rect.width / (timeRange.end - timeRange.start);
    const deltaMs = deltaX / pxPerMs;

    let newMin = timelineDragStart.current.zoomMin;
    let newMax = timelineDragStart.current.zoomMax;

    if (timelineDragMode.current === 'left') {
      // Stretch/shrink left edge
      newMin = Math.min(timelineDragStart.current.zoomMax - 1000, 
                        Math.max(timeRange.start, timelineDragStart.current.zoomMin + deltaMs));
    } else if (timelineDragMode.current === 'right') {
      // Stretch/shrink right edge
      newMax = Math.max(timelineDragStart.current.zoomMin + 1000, 
                        Math.min(timeRange.end, timelineDragStart.current.zoomMax + deltaMs));
    } else if (timelineDragMode.current === 'pan') {
      // Pan the whole viewport
      newMin = timelineDragStart.current.zoomMin + deltaMs;
      newMax = timelineDragStart.current.zoomMax + deltaMs;

      if (newMin < timeRange.start) {
        newMax += (timeRange.start - newMin);
        newMin = timeRange.start;
      }
      if (newMax > timeRange.end) {
        newMin -= (newMax - timeRange.end);
        newMax = timeRange.end;
      }
    }

    // Min range 1 second
    if (newMax - newMin < 1000) {
      const c = (newMin + newMax) / 2;
      newMin = c - 500;
      newMax = c + 500;
    }

    // Max range limit (prevent zoom out beyond data bounds)
    const totalRange = timeRange.end - timeRange.start;
    if (newMax - newMin > totalRange) {
      newMin = timeRange.start;
      newMax = timeRange.end;
    }

    setChartZoom({ min: newMin, max: newMax });
  }, [timeRange]);

  const handleTimelineMouseUp = useCallback(() => {
    isTimelineDragging.current = false;
    timelineDragStart.current = null;
    timelineDragMode.current = null;
  }, []);

  const handleChartMouseLeave = useCallback(() => {
    isPanning.current = false;
    panStart.current = null;
  }, []);

  // Touch gesture state for mobile
  const touchState = useRef<{
    touches: { clientX: number; clientY: number }[];
    initialDistance: number;
    initialZoom: { min: number; max: number } | null;
    lastTapTime: number;
  }>({ touches: [], initialDistance: 0, initialZoom: null, lastTapTime: 0 });

  const handleChartTouchStart = useCallback((e: React.TouchEvent) => {
    if (!timeRange) return;
    
    const touches = Array.from(e.touches).map(t => ({ clientX: t.clientX, clientY: t.clientY }));
    touchState.current.touches = touches;
    touchState.current.initialZoom = chartZoom ? { ...chartZoom } : { 
      min: timeRange.start, 
      max: timeRange.end 
    };
    
    if (touches.length === 2) {
      // Pinch start - calculate initial distance
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      touchState.current.initialDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }, [chartZoom, timeRange]);

  const handleChartTouchMove = useCallback((e: React.TouchEvent) => {
    if (!timeRange) return;
    e.preventDefault(); // Prevent page scroll
    
    const touches = Array.from(e.touches).map(t => ({ clientX: t.clientX, clientY: t.clientY }));
    const canvas = chartContainerRef.current?.querySelector('canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    
    if (touches.length === 2 && touchState.current.touches.length === 2) {
      // Pinch zoom
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const scale = touchState.current.initialDistance / distance;
      const initialRange = touchState.current.initialZoom!.max - touchState.current.initialZoom!.min;
      const newRange = initialRange * scale;
      
      // Center zoom on midpoint between fingers
      const midX = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
      const midRatio = midX / rect.width;
      const timeCenter = touchState.current.initialZoom!.min + initialRange * midRatio;
      
      let newMin = timeCenter - newRange * midRatio;
      let newMax = newMin + newRange;
      
      // Clamp bounds
      if (newMin < timeRange.start) {
        newMax += (timeRange.start - newMin);
        newMin = timeRange.start;
      }
      if (newMax > timeRange.end) {
        newMin -= (newMax - timeRange.end);
        newMax = timeRange.end;
      }
      if (newMax - newMin < 1000) {
        const c = (newMin + newMax) / 2;
        newMin = c - 500;
        newMax = c + 500;
      }

      // Max range limit (prevent zoom out beyond data bounds)
      const totalRange = timeRange.end - timeRange.start;
      if (newMax - newMin > totalRange) {
        newMin = timeRange.start;
        newMax = timeRange.end;
      }

      setChartZoom({ min: newMin, max: newMax });
    } else if (touches.length === 1 && touchState.current.touches.length === 1) {
      // Pan
      const deltaX = touches[0].clientX - touchState.current.touches[0].clientX;
      const pxPerMs = (touchState.current.initialZoom!.max - touchState.current.initialZoom!.min) / rect.width;
      const deltaMs = -deltaX * pxPerMs;
      
      let newMin = touchState.current.initialZoom!.min + deltaMs;
      let newMax = touchState.current.initialZoom!.max + deltaMs;
      
      if (newMin < timeRange.start) {
        newMax += (timeRange.start - newMin);
        newMin = timeRange.start;
      }
      if (newMax > timeRange.end) {
        newMin -= (newMax - timeRange.end);
        newMax = timeRange.end;
      }
      
      // Min range 1 second
      if (newMax - newMin < 1000) {
        const c = (newMin + newMax) / 2;
        newMin = c - 500;
        newMax = c + 500;
      }

      // Max range limit (prevent zoom out beyond data bounds)
      const totalRange = timeRange.end - timeRange.start;
      if (newMax - newMin > totalRange) {
        newMin = timeRange.start;
        newMax = timeRange.end;
      }

      setChartZoom({ min: newMin, max: newMax });
    }
  }, [timeRange]);

  const handleChartTouchEnd = useCallback(() => {
    touchState.current.touches = [];
    touchState.current.initialDistance = 0;
    touchState.current.initialZoom = null;
  }, []);

  const handleChartDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!timeRange || !chartContainerRef.current) return;
    
    const canvas = chartContainerRef.current.querySelector('canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseRatio = mouseX / rect.width;
    
    const currentMin = chartZoom?.min ?? timeRange.start;
    const currentMax = chartZoom?.max ?? timeRange.end;
    
    // Zoom in by 2x centered on click point
    const zoomFactor = 0.5;
    const mouseTime = currentMin + (currentMax - currentMin) * mouseRatio;
    let newMin = mouseTime - (mouseTime - currentMin) * zoomFactor;
    let newMax = mouseTime + (currentMax - mouseTime) * zoomFactor;
    
    // Clamp to time range bounds
    if (newMin < timeRange.start) {
      newMax += (timeRange.start - newMin);
      newMin = timeRange.start;
    }
    if (newMax > timeRange.end) {
      newMin -= (newMax - timeRange.end);
      newMax = timeRange.end;
    }
    
    // Min range 1 second
    if (newMax - newMin < 1000) {
      const c = (newMin + newMax) / 2;
      newMin = c - 500;
      newMax = c + 500;
    }

    // Max range limit (prevent zoom out beyond data bounds)
    const totalRange = timeRange.end - timeRange.start;
    if (newMax - newMin > totalRange) {
      newMin = timeRange.start;
      newMax = timeRange.end;
    }

    setChartZoom({ min: newMin, max: newMax });
  }, [timeRange, chartZoom]);

  // Shift + Scroll zoom handler
  const handleChartWheel = useCallback((e: React.WheelEvent) => {
    if (!timeRange) return;
    if (!e.shiftKey) return; // Only zoom when Shift is pressed
    
    e.preventDefault();
    
    const canvas = chartContainerRef.current?.querySelector('canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseRatio = mouseX / rect.width;
    
    const currentMin = chartZoom?.min ?? timeRange.start;
    const currentMax = chartZoom?.max ?? timeRange.end;
    
    // Zoom factor: scroll up (negative deltaY) = zoom in, scroll down = zoom out
    const zoomFactor = 1 + (e.deltaY > 0 ? 0.15 : -0.15);
    
    // Calculate new bounds centered on mouse position
    const mouseTime = currentMin + (currentMax - currentMin) * mouseRatio;
    let newMin = mouseTime - (mouseTime - currentMin) * zoomFactor;
    let newMax = mouseTime + (currentMax - mouseTime) * zoomFactor;
    
    // Clamp to time range bounds
    if (newMin < timeRange.start) {
      newMax += (timeRange.start - newMin);
      newMin = timeRange.start;
    }
    if (newMax > timeRange.end) {
      newMin -= (newMax - timeRange.end);
      newMax = timeRange.end;
    }
    
    // Min range 1 second (prevent too much zoom in)
    if (newMax - newMin < 1000) {
      const c = (newMin + newMax) / 2;
      newMin = c - 500;
      newMax = c + 500;
    }

    // Max range limit (prevent zoom out beyond data bounds)
    const totalRange = timeRange.end - timeRange.start;
    if (newMax - newMin > totalRange) {
      newMin = timeRange.start;
      newMax = timeRange.end;
    }

    setChartZoom({ min: newMin, max: newMax });
  }, [timeRange, chartZoom]);

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      alert(i18n['uploadError']);
      return;
    }
    setLoading(true);
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsedData = parseTripData(text);
        const summary = calculateSummary(parsedData);
        
        const timeRange = parsedData.length > 0 
          ? { start: parsedData[0].timestamp, end: parsedData[parsedData.length - 1].timestamp }
          : null;

        const newDataset: FileDataset = {
          id: `${file.name}-${Date.now()}`,
          name: file.name,
          data: parsedData,
          summary,
          timeRange,
        };

        setDatasets(prev => [...prev, newDataset]);
        setActiveDatasetId(newDataset.id);
        setData(parsedData);
        setSummary(summary);
        setTimeRange(timeRange);
        
        // Reset acceleration state when new file is loaded
        clearSettings();
        
        setLoading(false);
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Ошибка при чтении файла');
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => handleFile(file));
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Only show drag overlay if files are being dragged
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDragging(true);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    // Only hide overlay when leaving the container entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => handleFile(file));
    }
  };

  const handleSwitchDataset = (datasetId: string) => {
    const dataset = datasets.find(d => d.id === datasetId);
    if (dataset) {
      setActiveDatasetId(datasetId);
      setData(dataset.data);
      setSummary(dataset.summary);
      setTimeRange(dataset.timeRange);
      setFileName(dataset.name);
      clearSettings();
    }
  };

  const handleRemoveDataset = (datasetId: string) => {
    setDatasets(prev => {
      const newDatasets = prev.filter(d => d.id !== datasetId);
      if (activeDatasetId === datasetId && newDatasets.length > 0) {
        const nextActive = newDatasets[newDatasets.length - 1];
        setActiveDatasetId(nextActive.id);
        setData(nextActive.data);
        setSummary(nextActive.summary);
        setTimeRange(nextActive.timeRange);
        setFileName(nextActive.name);
        clearSettings();
      } else if (activeDatasetId === datasetId) {
        setActiveDatasetId(null);
        setData([]);
        setSummary(null);
        setTimeRange(null);
        setFileName('');
      }
      return newDatasets;
    });
  };

  // Common chart options for maximum performance
  const commonOptions = useChartOptions();

  // Optimized chart data generation with individual memoization for each dataset
  // Prevents recreating arrays when toggles change
  const chartDatasets = useMemo(() => {
    // Use compressed timestamps when hiding idle periods to collapse the chart
    const getTimestamp = (e: TripEntry) => {
      if (hideIdlePeriods && compressedTimeRange && activePeriods) {
        // Calculate compressed timestamp based on active periods
        let compressedTime = 0;
        for (const period of activePeriods) {
          if (e.timestamp >= period.start && e.timestamp <= period.end) {
            compressedTime += (e.timestamp - period.start);
            break;
          } else if (e.timestamp > period.end) {
            compressedTime += (period.end - period.start);
          }
        }
        return compressedTime;
      }
      return e.timestamp;
    };

    const datasets: Record<string, Array<{ x: number; y: number | null }>> = {
      speed: displayData.map(e => ({ x: getTimestamp(e), y: e.Speed })),
      gpsSpeed: displayData.map(e => ({ x: getTimestamp(e), y: e.GPSSpeed })),
      power: displayData.map(e => ({ x: getTimestamp(e), y: e.Power ?? null })),
      current: displayData.map(e => ({ x: getTimestamp(e), y: e.Current ?? null })),
      phaseCurrent: displayData.map(e => ({ x: getTimestamp(e), y: e.PhaseCurrent ?? null })),
      voltage: displayData.map(e => ({ x: getTimestamp(e), y: e.Voltage })),
      batteryLevel: displayData.map(e => ({ x: getTimestamp(e), y: e.BatteryLevel })),
      temperature: displayData.map(e => ({ x: getTimestamp(e), y: e.Temperature })),
      temp2: displayData.map(e => ({ x: getTimestamp(e), y: e.Temp2 ?? null })),
      torque: displayData.map(e => ({ x: getTimestamp(e), y: e.Torque ?? null })),
      pwm: displayData.map(e => ({ x: getTimestamp(e), y: e.PWM })),
    };
    return datasets;
  }, [displayData, hideIdlePeriods, compressedTimeRange, activePeriods]);

  // Combined chart data with toggles - only constructs final datasets object
  const combinedChartData = useMemo(() => {
    const datasets: Array<{
      label: string;
      data: Array<{ x: number; y: number | null | undefined }>;
      borderColor: string;
      backgroundColor?: string;
      fill?: boolean;
      tension?: number;
      yAxisID?: string;
      borderDash?: number[];
    }> = [];

    if (chartToggles.speed) {
      datasets.push({
        label: 'Speed (km/h)',
        data: chartDatasets.speed,
        borderColor: '#3b82f6', // primary
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.1,
        yAxisID: 'y',
      });
    }

    if (chartToggles.gpsSpeed) {
      datasets.push({
        label: 'GPS Speed (km/h)',
        data: chartDatasets.gpsSpeed,
        borderColor: '#10b981', // success
        tension: 0.1,
        borderDash: [5, 5],
        yAxisID: 'y',
      });
    }

    if (chartToggles.power) {
      datasets.push({
        label: 'Power (W)',
        data: chartDatasets.power,
        borderColor: '#f59e0b', // warning
        tension: 0.1,
        yAxisID: 'y1',
      });
    }

    if (chartToggles.current) {
      datasets.push({
        label: 'Current (A)',
        data: chartDatasets.current,
        borderColor: '#ef4444', // danger
        tension: 0.1,
        yAxisID: 'y2',
      });
    }

    if (chartToggles.phaseCurrent && displayData[0]?.PhaseCurrent !== undefined) {
      datasets.push({
        label: 'Phase Current (A)',
        data: chartDatasets.phaseCurrent,
        borderColor: '#f87171', // danger-light
        tension: 0.1,
        borderDash: [2, 2],
        yAxisID: 'y2',
      });
    }

    if (chartToggles.voltage) {
      datasets.push({
        label: 'Voltage (V)',
        data: chartDatasets.voltage,
        borderColor: '#8b5cf6', // info
        tension: 0.1,
        yAxisID: 'y',
      });
    }

    if (chartToggles.batteryLevel) {
      datasets.push({
        label: 'Battery %',
        data: chartDatasets.batteryLevel,
        borderColor: '#ec4899', // pink (battery)
        tension: 0.1,
        yAxisID: 'y3',
      });
    }

    if (chartToggles.temperature) {
      datasets.push({
        label: 'Temperature (°C)',
        data: chartDatasets.temperature,
        borderColor: '#f97316', // warning-light
        tension: 0.1,
        yAxisID: 'y',
      });
    }

    if (chartToggles.temp2 && displayData[0]?.Temp2 !== undefined) {
      datasets.push({
        label: 'Temp 2 (°C)',
        data: chartDatasets.temp2,
        borderColor: '#fb923c', // orange
        tension: 0.1,
        borderDash: [3, 3],
        yAxisID: 'y',
      });
    }

    if (chartToggles.torque && displayData[0]?.Torque !== undefined) {
      datasets.push({
        label: 'Torque',
        data: chartDatasets.torque,
        borderColor: '#a78bfa', // info-light
        tension: 0.1,
        yAxisID: 'y4',
      });
    }

    if (chartToggles.pwm) {
      datasets.push({
        label: 'PWM',
        data: chartDatasets.pwm,
        borderColor: '#06b6d4', // accent
        tension: 0.1,
        borderDash: [4, 4],
        yAxisID: 'y5',
      });
    }

    return { datasets };
  }, [chartDatasets, chartToggles, displayData]);

  // Export full page as PNG image using html-to-image
  const handleShareStats = async () => {
    if (!data.length) {
      alert('Нет данных для сохранения. Загрузите CSV файл.');
      return;
    }
    
    // Find the main content container
    const element = document.querySelector('[data-export-container]') as HTMLElement || 
                   document.querySelector('.relative.z-10') as HTMLElement;
    if (!element) {
      alert('Не найден контейнер для экспорта');
      return;
    }
    
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'screenshot-loading';
    loadingDiv.innerHTML = `
      <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
        <div style="background:rgba(15,23,42,0.95);padding:24px 40px;border-radius:16px;border:1px solid rgba(59,130,246,0.3);text-align:center;">
          <div style="width:48px;height:48px;border:4px solid rgba(59,130,246,0.2);border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;"></div>
          <p style="color:#fff;font-family:system-ui,sans-serif;font-size:14px;margin:0;">Создание скриншота...</p>
          <p style="color:#64748b;font-family:system-ui,sans-serif;font-size:12px;margin:8px 0 0;">Это может занять несколько секунд</p>
        </div>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;
    document.body.appendChild(loadingDiv);
    
    // Store original styles
    const originalMaxWidth = element.style.maxWidth;
    const originalWidth = element.style.width;
    
    try {
      // Wait for UI to settle
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Temporarily remove max-width constraint to capture full content
      element.style.maxWidth = 'none';
      element.style.width = 'auto';
      
      // Force layout recalculation
      element.getBoundingClientRect();
      
      const dataUrl = await toPng(element, {
        quality: 0.95,
        pixelRatio: 1.5,
        backgroundColor: '#0f172a',
        skipFonts: false,
        cacheBust: true,
        style: {
          transform: 'none',
          maxHeight: 'none',
          maxWidth: 'none',
          overflow: 'visible',
          width: 'auto'
        },
        // Ensure we capture the full scrollable width
        width: element.scrollWidth,
        height: element.scrollHeight
      });
      
      // Restore original styles
      element.style.maxWidth = originalMaxWidth;
      element.style.width = originalWidth;
      
      // Create download
      const link = document.createElement('a');
      const cleanFileName = fileName.replace(/\.csv$/i, '').replace(/[^a-z0-9а-яё_-]/gi, '_') || 'trip';
      const date = new Date().toISOString().slice(0, 10);
      link.download = `trip-log-${cleanFileName}-${date}.png`;
      link.href = dataUrl;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Screenshot failed:', error);
      alert('Ошибка создания скриншота: ' + (error instanceof Error ? error.message : 'Неизвестная ошибка'));
      // Restore original styles on error
      element.style.maxWidth = originalMaxWidth;
      element.style.width = originalWidth;
    } finally {
      const loading = document.getElementById('screenshot-loading');
      if (loading) {
        document.body.removeChild(loading);
      }
    }
  };

  return (
    <div
      className={cn(
        "min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white transition-colors duration-500",
        isDragging && "from-blue-950 via-slate-900 to-blue-950"
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Background pattern */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none" />
      
      <div data-export-container className="relative z-10 max-w-[1600px] mx-auto px-4 py-4 md:px-6 md:py-8" onDragOver={onDragOver}>
        {/* Modern Header */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg shadow-blue-500/25">
              <Activity className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                {i18n['appTitle']}
              </h1>
              <p className="text-slate-400 text-xs md:text-sm">{i18n['appSubtitle']}</p>
              {datasets.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {datasets.map(dataset => (
                      <div
                        key={dataset.id}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs cursor-pointer transition-colors ${
                          dataset.id === activeDatasetId
                            ? 'bg-blue-500/30 text-blue-200 border border-blue-500/50'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-slate-600'
                        }`}
                        onClick={() => handleSwitchDataset(dataset.id)}
                      >
                        <span className="truncate max-w-[150px]">{dataset.name}</span>
                        {datasets.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveDataset(dataset.id);
                            }}
                            className="ml-1 hover:text-red-400 transition-colors"
                            title="Удалить"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {fileName && (
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-xs text-emerald-400 font-medium truncate max-w-[300px]">{fileName}</p>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowSettingsPanel(true)}
            className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
            aria-label="Открыть настройки"
            title="Настройки"
          >
            <Settings className="w-5 h-5" />
          </button>
          {hasGPSData && (
            <button
              onClick={() => setShowMap(!showMap)}
              className={cn(
                "p-3 border rounded-xl transition-colors",
                showMap
                  ? "bg-blue-500/30 border-blue-500/60 text-blue-200"
                  : "bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
              aria-label={showMap ? "Скрыть карту" : "Показать карту"}
              title={showMap ? "Скрыть карту" : "Показать карту"}
            >
              <MapPin className="w-5 h-5" />
            </button>
          )}
        </header>

        {/* Hidden file input for start page upload */}
        <input type="file" accept=".csv" multiple className="hidden" onChange={handleFileUpload} aria-label="Загрузить CSV файлы" />

        {/* Drag overlay */}
        {isDragging && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-blue-600/20 backdrop-blur-sm pointer-events-none">
            <div className="text-center bg-slate-900/95 p-10 rounded-2xl shadow-2xl border-2 border-dashed border-blue-500/50 animate-pulse">
              <Upload className="w-20 h-20 mx-auto mb-6 text-blue-400" strokeWidth={1.5} />
              <p className="text-3xl font-bold text-white mb-2">{i18n['dropCSV']}</p>
              <p className="text-blue-400/80">{i18n['dropCSVSubtitle']}</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-red-400 font-medium text-sm">Ошибка загрузки файла</p>
                <p className="text-red-300/80 text-xs">{error}</p>
              </div>
            </div>
            <button
              onClick={() => setError(null)}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/30 transition-colors"
              aria-label="Закрыть ошибку"
            >
              Закрыть
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="flex flex-col justify-center items-center h-64 md:h-96">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <div className="absolute inset-0 w-20 h-20 border-4 border-purple-500/20 border-b-purple-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            </div>
            <p className="text-slate-400 mt-6 animate-pulse font-medium">{i18n['parsingData']}</p>
          </div>
        ) : data.length === 0 ? (
          <>
            {/* Start page - choice between large file and small demo */}
            <div className="flex flex-col items-center justify-center h-64 md:h-96 space-y-4 md:space-y-6">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-bold text-white">Выберите режим загрузки</h2>
                <p className="text-slate-400">Загрузите свой файл или используйте демо-данные</p>
              </div>
              <div className="flex gap-4 flex-wrap justify-center">
                <button
                  onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()}
                  className="group flex flex-col items-center gap-3 px-8 py-6 rounded-2xl transition-all duration-300 bg-gradient-to-br from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105 active:scale-95 min-w-[200px]"
                >
                  <Upload className="w-8 h-8 group-hover:animate-bounce" strokeWidth={2} />
                  <span className="font-semibold text-white">Загрузить свой файл</span>
                  <span className="text-xs text-blue-200">CSV файл</span>
                </button>
                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const response = await fetch('./demo-trip-small.csv');
                      const text = await response.text();
                      const parsedData = parseTripData(text);
                      setData(parsedData);
                      setSummary(calculateSummary(parsedData));
                      setFileName('demo-trip-small.csv');
                      resetZoom();
                      if (parsedData.length > 0) {
                        const timestamps = parsedData.map(e => e.timestamp);
                        setTimeRange({
                          start: Math.min(...timestamps),
                          end: Math.max(...timestamps),
                        });
                      }
                    } catch {
                      alert('Ошибка загрузки демо-файла');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="group flex flex-col items-center gap-3 px-8 py-6 rounded-2xl transition-all duration-300 bg-gradient-to-br from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-lg shadow-green-500/25 hover:shadow-xl hover:shadow-green-500/30 hover:scale-105 active:scale-95 min-w-[200px]"
                >
                  <Play className="w-8 h-8 group-hover:animate-pulse" strokeWidth={2} />
                  <span className="font-semibold text-white">Маленький демо</span>
                  <span className="text-xs text-green-200">20 минут • 0.85 MB</span>
                </button>
                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const response = await fetch('./demo-trip-6hours.csv');
                      const text = await response.text();
                      const parsedData = parseTripData(text);
                      setData(parsedData);
                      setSummary(calculateSummary(parsedData));
                      setFileName('demo-trip-6hours.csv');
                      resetZoom();
                      if (parsedData.length > 0) {
                        const timestamps = parsedData.map(e => e.timestamp);
                        setTimeRange({
                          start: Math.min(...timestamps),
                          end: Math.max(...timestamps),
                        });
                      }
                    } catch {
                      alert('Ошибка загрузки демо-файла');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="group flex flex-col items-center gap-3 px-8 py-6 rounded-2xl transition-all duration-300 bg-gradient-to-br from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 hover:scale-105 active:scale-95 min-w-[200px]"
                >
                  <Play className="w-8 h-8 group-hover:animate-pulse" strokeWidth={2} />
                  <span className="font-semibold text-white">Большой демо</span>
                  <span className="text-xs text-purple-200">6 часов • 15.15 MB</span>
                </button>
              </div>
            </div>
          </>
        ) : data.length > 0 && summary ? (
          <>
            
            {/* Trip Data Section - Overview and Telemetry */}
            <div className="space-y-4 md:space-y-6">
                            <TripOverview 
                summary={filteredSummary!}
                visibleMetrics={visibleMetrics}
                onVisibleMetricsChange={(key) => setVisibleMetrics(prev => ({ ...prev, [key]: !prev[key] }))}
                onHideAll={() => {
                  setVisibleMetrics({
                    maxSpeed: false,
                    avgSpeed: false,
                    avgMovingSpeed: false,
                    ridingTime: false,
                    totalSamples: false,
                    maxTorque: false,
                    maxPhaseCurrent: false,
                    maxTemp: false,
                  });
                }}
                onFileLoad={() => {
                  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
                  if (input) input.click();
                }}
                onShare={handleShareStats}
              />

              {showMap && hasGPSData && (
                <div className="bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 shadow-lg">
                  <div className="p-4 border-b border-white/10">
                    <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-blue-400" />
                      GPS Трек
                    </h3>
                  </div>
                  <div className="p-4">
                    <GPSMap data={data} currentTime={currentTime} height="300px" />
                  </div>
                </div>
              )}

              {/* Main Chart with Built-in Time Range & Zoom */}
              <div className="bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 shadow-lg">
              {/* Header with tabs and controls - 2 rows centered */}
              <div className="p-3 border-b border-white/10">
                {/* Row 1: Title and Controls */}
                <div className="flex items-center justify-center gap-4 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-slate-700/50 rounded-lg">
                      <BarChart className="w-4 h-4 text-slate-300" strokeWidth={2.5} />
                    </div>
                    <h3 className="text-base font-bold text-slate-200">
                      {i18n['tripTelemetry']}
                    </h3>
                  </div>

                  {/* Chart Controls - grouped by function */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Unified Settings Group */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-xl border border-white/5">
                      <div className="relative">
                        <button
                          onClick={() => setShowUnifiedSettings(prev => !prev)}
                          className={cn(
                            "px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center gap-2 min-h-[44px]",
                            (filterConfig.enabled || hideIdlePeriods || showTelemetryToggles)
                              ? "bg-blue-500/30 border-blue-500/60 text-blue-200"
                              : "bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700"
                          )}
                          title="Настройки: обработка данных, фильтрация аномалий, отображение графиков"
                        >
                          <Settings className={cn("w-4 h-4 transition-transform duration-200", showUnifiedSettings ? "rotate-180" : "")} />
                          <span className="hidden sm:inline">Настройки</span>
                          </button>
                        {showUnifiedSettings && (
                          <div className="absolute top-full left-0 mt-2 w-[28rem] bg-slate-900/95 backdrop-blur-xl rounded-xl border border-white/10 shadow-xl z-50">
                            {/* Tab Headers */}
                            <div className="flex border-b border-white/10">
                              <button
                                onClick={() => setSettingsTab('processing')}
                                className={cn(
                                  "flex-1 px-3 py-2.5 text-xs font-medium transition-colors",
                                  settingsTab === 'processing'
                                    ? "text-blue-200 bg-blue-500/20 border-b-2 border-blue-400"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                                )}
                              >
                                <Activity className="w-3.5 h-3.5 inline mr-1.5" />
                                Обработка
                              </button>
                              <button
                                onClick={() => setSettingsTab('visualization')}
                                className={cn(
                                  "flex-1 px-3 py-2.5 text-xs font-medium transition-colors",
                                  settingsTab === 'visualization'
                                    ? "text-blue-200 bg-blue-500/20 border-b-2 border-blue-400"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                                )}
                              >
                                <BarChart className="w-3.5 h-3.5 inline mr-1.5" />
                                Графики
                              </button>
                            </div>

                            {/* Tab Content */}
                            <div className="p-4 max-h-[50vh] overflow-y-auto">
                              {settingsTab === 'processing' && (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-white/5">
                                    <div className="flex items-center gap-2">
                                      <Clock className={cn("w-4 h-4", hideIdlePeriods ? "text-emerald-400" : "text-slate-400")} />
                                      <div>
                                        <span className="text-xs font-medium text-slate-200">Скрыть простои</span>
                                        <p className="text-[10px] text-slate-500">Убирает стоянки</p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => setHideIdlePeriods(prev => !prev)}
                                      className={cn(
                                        "relative w-10 h-5 rounded-full transition-colors duration-200",
                                        hideIdlePeriods ? "bg-emerald-500" : "bg-slate-600"
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200",
                                          hideIdlePeriods ? "translate-x-5" : "translate-x-0"
                                        )}
                                      />
                                    </button>
                                  </div>

                                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-white/5">
                                    <div className="flex items-center gap-2">
                                      <Activity className={cn("w-4 h-4", filterConfig.enabled ? "text-emerald-400" : "text-slate-400")} />
                                      <div>
                                        <span className="text-xs font-medium text-slate-200">Фильтр аномалий</span>
                                        <p className="text-[10px] text-slate-500">Удаляет скачки GPS</p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => setFilterConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                                      className={cn(
                                        "relative w-10 h-5 rounded-full transition-colors duration-200",
                                        filterConfig.enabled ? "bg-emerald-500" : "bg-slate-600"
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200",
                                          filterConfig.enabled ? "translate-x-5" : "translate-x-0"
                                        )}
                                      />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {settingsTab === 'visualization' && (
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center gap-1 px-2 py-2 bg-slate-800/30 rounded-lg border border-white/5">
                                    <ToggleChip label={i18n['speed']} active={chartToggles.speed} onClick={() => setChartToggles(p => ({...p, speed: !p.speed}))} color="primary" />
                                    {displayData[0]?.GPSSpeed !== undefined && (
                                      <ToggleChip label={i18n['gpsSpeed']} active={chartToggles.gpsSpeed} onClick={() => setChartToggles(p => ({...p, gpsSpeed: !p.gpsSpeed}))} color="success" />
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1 px-2 py-2 bg-slate-800/30 rounded-lg border border-white/5">
                                    <ToggleChip label={i18n['power']} active={chartToggles.power} onClick={() => setChartToggles(p => ({...p, power: !p.power}))} color="warning" />
                                    <ToggleChip label={i18n['current']} active={chartToggles.current} onClick={() => setChartToggles(p => ({...p, current: !p.current}))} color="danger" />
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1 px-2 py-2 bg-slate-800/30 rounded-lg border border-white/5">
                                    <ToggleChip label={i18n['voltage']} active={chartToggles.voltage} onClick={() => setChartToggles(p => ({...p, voltage: !p.voltage}))} color="info" />
                                    <ToggleChip label={i18n['temp']} active={chartToggles.temperature} onClick={() => setChartToggles(p => ({...p, temperature: !p.temperature}))} color="warning" />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                  </div>
                </div>

                {/* Row 2: Centered hint */}
                <div className="flex justify-center pt-1">
                  <p className="text-[10px] text-slate-500 text-center">
                    💡 Обработка данных — фильтр аномалий и скрытие простоев • Привязка — точное чтение точек
                  </p>
                </div>
              </div>

              {/* Chart Area with interactive controls */}
              <div
                ref={chartContainerRef}
                className="relative cursor-grab active:cursor-grabbing select-none touch-none"
                style={{
                  boxSizing: 'border-box',
                  touchAction: 'auto',
                  display: 'block',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
                }}
                onMouseDown={handleChartMouseDown}
                onMouseMove={handleChartMouseMove}
                onMouseUp={handleChartMouseUp}
                onMouseLeave={handleChartMouseLeave}
                onDoubleClick={handleChartDoubleClick}
                onWheel={handleChartWheel}
                onTouchStart={handleChartTouchStart}
                onTouchMove={handleChartTouchMove}
                onTouchEnd={handleChartTouchEnd}
                onClick={(e) => {
                  e.stopPropagation();
                  // Show info bar and freeze data on chart click
                  setShowInfoBar(true);
                  setInfoBarFrozen(true);
                }}
              >
                {/* Chart Controls Overlay - positioned horizontally above canvas */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-xl border border-white/5 mb-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setChartView('line')}
                      className={cn(
                        "px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center gap-2 min-h-[44px]",
                        chartView === 'line'
                          ? "bg-blue-500/30 border-blue-500/60 text-blue-200"
                          : "bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700"
                      )}
                      title="Линейный график: Показывает данные как непрерывные линии во времени. Идеально для анализа трендов скорости, мощности и других параметров во время поездки."
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                      <span className="hidden sm:inline">Линия</span>
                    </button>
                    <button
                      onClick={() => setChartView('scatter')}
                      className={cn(
                        "px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center gap-2 min-h-[44px]",
                        chartView === 'scatter'
                          ? "bg-purple-500/30 border-purple-500/60 text-purple-200"
                          : "bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700"
                      )}
                      title="Точечная диаграмма: Показывает зависимости между параметрами (например, скорость vs мощность). Полезно для выявления корреляций и аномалий в данных."
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="19" cy="5" r="1" />
                        <circle cx="5" cy="19" r="1" />
                      </svg>
                      <span className="hidden sm:inline">Точки</span>
                    </button>
                  </div>
                  <div className="w-px h-6 bg-white/10 mx-1" />
                  <button
                    onClick={() => setChartSnapMode(prev => !prev)}
                    className={cn(
                      "px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center gap-2 min-h-[44px]",
                      chartSnapMode
                        ? "bg-cyan-500/30 border-cyan-500/60 text-cyan-200"
                        : "bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700"
                    )}
                    title={`Привязка курсора: ${chartSnapMode ? 'курсор привязывается к ближайшей точке данных для точного чтения значений (включено)' : 'свободное перемещение курсора без привязки к точкам (выключено)'}. Полезно для точного анализа значений в конкретные моменты времени.`}
                  >
                    {chartSnapMode ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="4" x2="12" y2="20" />
                      </svg>
                    )}
                    <span className="hidden sm:inline">Привязка</span>
                  </button>
                  <div className="w-px h-6 bg-white/10 mx-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoBarFrozen(prev => !prev);
                    }}
                    className={cn(
                      "px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center gap-2 min-h-[44px]",
                      infoBarFrozen
                        ? "bg-amber-500/30 border-amber-500/60 text-amber-200"
                        : "bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700"
                    )}
                    title={`Зафиксировать данные: ${infoBarFrozen ? 'данные зафиксированы, не обновляются при движении курсора (включено)' : 'данные обновляются автоматически при движении курсора (выключено)'}. Полезно для просмотра значений в конкретной точке.`}
                  >
                    {infoBarFrozen ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    <span className="hidden sm:inline">Фикс</span>
                  </button>
                  <div className="w-px h-6 bg-white/10 mx-1" />
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        if (!timeRange) return;
                        const currentMin = chartZoom?.min ?? timeRange.start;
                        const currentMax = chartZoom?.max ?? timeRange.end;
                        const currentRange = currentMax - currentMin;
                        const center = (currentMin + currentMax) / 2;
                        const newRange = currentRange * 0.7;
                        setChartZoom({ min: center - newRange / 2, max: center + newRange / 2 });
                      }}
                      className="px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center gap-2 min-h-[44px] bg-blue-500/20 border-blue-500/30 text-blue-200 hover:bg-blue-500/30"
                      title="Увеличить масштаб: приблизить к центру текущего видимого диапазона на 30%. Полезно для детального анализа конкретных участков поездки."
                    >
                      <ZoomIn className="w-4 h-4 text-blue-300" />
                    </button>
                    <button
                      onClick={resetZoom}
                      className="px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center gap-2 min-h-[44px] bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700"
                      title="Сбросить масштаб: вернуть полный вид всей поездки от начала до конца. Возвращает к исходному масштабу для обзора всей поездки."
                    >
                      <ZoomOut className="w-4 h-4" />
                      <span className="hidden sm:inline">Сброс</span>
                    </button>
                  </div>
                  <div className="w-px h-6 bg-white/10 mx-1" />
                                  </div>

                
                <div className="h-[450px] w-full">
                  {chartView === 'line' ? (
                    <Line
                      options={{
                        ...commonOptions,
                        scales: {
                          x: {
                            type: 'time',
                            min: chartZoom?.min,
                            max: chartZoom?.max,
                            time: {
                              unit: 'minute',
                              displayFormats: { minute: 'HH:mm' }
                            },
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 11 } }
                          },
                          y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                            ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 11 } },
                            border: { display: false },
                            title: { display: true, text: 'Speed', color: 'rgba(59, 130, 246, 0.7)', font: { size: 11 } }
                          },
                          y1: {
                            type: 'linear',
                            display: chartToggles.power,
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            ticks: { color: 'rgba(245, 158, 11, 0.7)', font: { size: 11 } },
                            border: { display: false },
                            title: { display: true, text: 'Power', color: 'rgba(245, 158, 11, 0.7)', font: { size: 11 } }
                          },
                          y2: {
                            type: 'linear',
                            display: chartToggles.current || chartToggles.phaseCurrent,
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            offset: chartToggles.current && chartToggles.phaseCurrent,
                            ticks: { color: 'rgba(239, 68, 68, 0.7)', font: { size: 11 } },
                            border: { display: false },
                            title: { display: true, text: 'Current', color: 'rgba(239, 68, 68, 0.7)', font: { size: 11 } }
                          },
                          y3: {
                            type: 'linear',
                            display: chartToggles.batteryLevel,
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            offset: true,
                            min: 0,
                            max: 100,
                            ticks: { color: 'rgba(236, 72, 153, 0.7)', font: { size: 11 } },
                            border: { display: false },
                            title: { display: true, text: 'Battery', color: 'rgba(236, 72, 153, 0.7)', font: { size: 11 } }
                          },
                          y4: {
                            type: 'linear',
                            display: chartToggles.torque,
                            position: 'left',
                            grid: { drawOnChartArea: false },
                            offset: true,
                            ticks: { color: 'rgba(167, 139, 250, 0.7)', font: { size: 11 } },
                            border: { display: false },
                            title: { display: true, text: 'Torque', color: 'rgba(167, 139, 250, 0.7)', font: { size: 11 } }
                          },
                          y5: {
                            type: 'linear',
                            display: chartToggles.pwm,
                            position: 'right',
                            grid: { drawOnChartArea: false },
                            offset: true,
                            min: 0,
                            max: 100,
                            ticks: { color: 'rgba(6, 182, 212, 0.7)', font: { size: 11 } },
                            border: { display: false },
                            title: { display: true, text: 'PWM', color: 'rgba(6, 182, 212, 0.7)', font: { size: 11 } }
                          },
                        },
                        interaction: { 
                          mode: chartSnapMode ? 'nearest' : 'index', 
                          intersect: chartSnapMode,
                          axis: 'x'
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
                            displayColors: true,
                            boxPadding: 4,
                          }
                        },
                        onHover: throttle((_event: unknown, activeElements: unknown[]) => {
                          if (!activeElements.length) return;

                          const dataIndex = (activeElements as { index: number }[])[0].index;
                          const dataPoint = displayData[dataIndex];
                          if (!dataPoint) return;

                          // Update current time for GPS map sync
                          setCurrentTime(dataPoint.timestamp);

                          const newData = [
                            { label: 'Скорость', value: dataPoint.Speed, color: '#3b82f6', unit: 'км/ч' },
                            { label: 'GPS', value: dataPoint.GPSSpeed, color: '#10b981', unit: 'км/ч' },
                            { label: 'Мощность', value: dataPoint.Power, color: '#f59e0b', unit: 'Вт' },
                            { label: 'Ток', value: dataPoint.Current, color: '#ef4444', unit: 'А' },
                            { label: 'Напряжение', value: dataPoint.Voltage, color: '#8b5cf6', unit: 'В' },
                            { label: 'Батарея', value: dataPoint.BatteryLevel, color: '#ec4899', unit: '%' },
                            { label: 'Темп', value: dataPoint.Temperature, color: '#f97316', unit: '°C' },
                            { label: 'PWM', value: dataPoint.PWM, color: '#06b6d4', unit: '%' },
                          ];

                          const timestamp = new Date(dataPoint.timestamp).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          });

                          // Update info bar state
                          setShowInfoBar(true);
                          setInfoBarFrozen(true);
                          setInfoBarData(newData);
                          setInfoBarTimestamp(timestamp);
                        }, 50),
                        onClick: (_event: unknown, activeElements: unknown[]) => {
                          if (!activeElements.length) return;

                          const dataIndex = (activeElements as { index: number }[])[0].index;
                          const dataPoint = displayData[dataIndex];
                          if (!dataPoint) return;

                          const newData = [
                            { label: 'Скорость', value: dataPoint.Speed, color: '#3b82f6', unit: 'км/ч' },
                            { label: 'GPS', value: dataPoint.GPSSpeed, color: '#10b981', unit: 'км/ч' },
                            { label: 'Мощность', value: dataPoint.Power, color: '#f59e0b', unit: 'Вт' },
                            { label: 'Ток', value: dataPoint.Current, color: '#ef4444', unit: 'А' },
                            { label: 'Напряжение', value: dataPoint.Voltage, color: '#8b5cf6', unit: 'В' },
                            { label: 'Батарея', value: dataPoint.BatteryLevel, color: '#ec4899', unit: '%' },
                            { label: 'Темп', value: dataPoint.Temperature, color: '#f97316', unit: '°C' },
                            { label: 'PWM', value: dataPoint.PWM, color: '#06b6d4', unit: '%' },
                          ];

                          const timestamp = new Date(dataPoint.timestamp).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          });

                          // Update info bar state
                          setShowInfoBar(true);
                          setInfoBarFrozen(true);
                          setInfoBarData(newData);
                          setInfoBarTimestamp(timestamp);
                        }
                      } as any}
                      data={combinedChartData}
                    />
                  ) : (
                    <ScatterPlot data={filteredData} />
                  )}
                </div>

                {/* Integrated Timeline - compact version inside chart area */}
                {timeRange && (
                  <div className="mt-3 px-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {compressedTimeRange ? 'Сжатая шкала:' : 'Шкала:'}
                      </span>
                      <div 
                        data-timeline
                        className="flex-1 relative h-5 bg-white/5 rounded overflow-hidden cursor-pointer hover:bg-white/10 transition-colors"
                        onMouseDown={handleTimelineMouseDown}
                        onMouseMove={handleTimelineMouseMove}
                        onMouseUp={handleTimelineMouseUp}
                        onMouseLeave={handleTimelineMouseUp}
                      >
                        {/* Background - show segments when collapsed */}
                        {hideIdlePeriods && collapsedTimeRange ? (
                          <>
                            {collapsedTimeRange.periods.map((period, index) => {
                              const prevPeriod = index > 0 ? collapsedTimeRange.periods[index - 1] : null;
                              const gapStart = prevPeriod ? prevPeriod.end : timeRange.start;
                              const effectiveRange = compressedTimeRange || timeRange;
                              
                              return (
                                <div key={index}>
                                  {index > 0 && (
                                    <div
                                      className="absolute top-0 bottom-0 bg-slate-800/50"
                                      style={{
                                        left: `${((gapStart - effectiveRange.start) / (effectiveRange.end - effectiveRange.start)) * 100}%`,
                                        width: `${((period.start - gapStart) / (effectiveRange.end - effectiveRange.start)) * 100}%`,
                                      }}
                                    />
                                  )}
                                  <div
                                    className="absolute top-0 bottom-0 bg-gradient-to-r from-blue-900/40 to-purple-900/40"
                                    style={{
                                      left: `${((period.start - effectiveRange.start) / (effectiveRange.end - effectiveRange.start)) * 100}%`,
                                      width: `${((period.end - period.start) / (effectiveRange.end - effectiveRange.start)) * 100}%`,
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </>
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 to-purple-900/20" />
                        )}
                        
                        {/* Current viewport with draggable edges */}
                        {chartZoom && (
                          <>
                            <div
                              className="absolute top-0 bottom-0 bg-blue-500/30 hover:bg-blue-500/40 transition-colors"
                              style={{
                                left: `${((chartZoom.min - (compressedTimeRange || timeRange).start) / ((compressedTimeRange || timeRange).end - (compressedTimeRange || timeRange).start)) * 100}%`,
                                width: `${((chartZoom.max - chartZoom.min) / ((compressedTimeRange || timeRange).end - (compressedTimeRange || timeRange).start)) * 100}%`,
                              }}
                            />
                            <div
                              className="absolute top-0 bottom-0 w-1.5 bg-blue-400/60 hover:bg-blue-400 cursor-col-resize transition-colors"
                              style={{
                                left: `${((chartZoom.min - (compressedTimeRange || timeRange).start) / ((compressedTimeRange || timeRange).end - (compressedTimeRange || timeRange).start)) * 100}%`,
                                transform: 'translateX(-50%)',
                              }}
                            />
                            <div
                              className="absolute top-0 bottom-0 w-1.5 bg-blue-400/60 hover:bg-blue-400 cursor-col-resize transition-colors"
                              style={{
                                left: `${((chartZoom.max - (compressedTimeRange || timeRange).start) / ((compressedTimeRange || timeRange).end - (compressedTimeRange || timeRange).start)) * 100}%`,
                                transform: 'translateX(-50%)',
                              }}
                            />
                          </>
                        )}
                        
                        {/* Time labels */}
                        <div className="absolute inset-0 flex justify-between px-2 items-center text-[9px] text-slate-600 pointer-events-none">
                          <span>{new Date((compressedTimeRange || timeRange).start).toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}</span>
                          <span>{new Date((compressedTimeRange || timeRange).end).toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                      </div>
                      {chartZoom && (
                        <button
                          onClick={resetZoom}
                          className="text-[10px] text-blue-400 hover:text-blue-300 whitespace-nowrap px-2 py-1 bg-blue-500/10 rounded border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
                        >
                          Сброс
                        </button>
                      )}
                    </div>
                  </div>
                )}
                </div>
              </div>
            </div>

            {/* Acceleration Section */}
            <div className="bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 shadow-lg mt-6">
              <button
                onClick={() => toggleSection('acceleration')}
                className="w-full p-3 border-b border-white/10 flex items-center justify-center gap-2 hover:bg-white/5 transition-colors"
              >
                <Activity className="w-4 h-4 text-slate-300" strokeWidth={2.5} />
                <span className="text-base font-bold text-slate-200">
                  Ускорения
                </span>
                {collapsedSections.acceleration ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {!collapsedSections.acceleration && (
                <div className="p-5">
                  {accelerationAttempts.length === 0 ? (
                    <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 p-8 text-center">
                      <p className="text-white/50 text-sm mb-2">Нет попыток для анализа ускорений</p>
                      <p className="text-white/30 text-xs">Загрузите данные поездки для определения ускорений</p>
                    </div>
                  ) : (
                    <AccelerationTab
                      accelerationAttempts={accelerationAttempts}
                      data={data}
                      clearSettings={clearSettings}
                    />
                  )}
                </div>
              )}
            </div>
              </div>
            </div>

            </>
        ) : (
          <div className="relative overflow-hidden bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl h-[500px] flex flex-col items-center justify-center text-center px-6">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />
            <div className="absolute top-10 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl" />
            
            <div className="relative z-10">
              <div className="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-3xl mb-6 inline-block border border-white/10">
                <Upload className="w-16 h-16 text-blue-400" strokeWidth={1.5} />
              </div>
              <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                {i18n['readyToAnalyze']}
              </h2>
              <p className="text-slate-400 max-w-md mb-4">
                {i18n['uploadPrompt']}
              </p>
              
              {/* Demo file button */}
              <TripOverview 
                summary={filteredSummary!}
                visibleMetrics={visibleMetrics}
                onVisibleMetricsChange={(key) => setVisibleMetrics(prev => ({ ...prev, [key]: !prev[key] }))}
                onHideAll={() => {
                  setVisibleMetrics({
                    maxSpeed: false,
                    avgSpeed: false,
                    avgMovingSpeed: false,
                    ridingTime: false,
                    totalSamples: false,
                    maxTorque: true,
                    maxPhaseCurrent: false,
                    maxTemp: false,
                  });
                }}
                onFileLoad={() => fileInputRef.current?.click()}
                onShare={async () => {
                  try {
                    const dataUrl = await toPng(chartContainerRef.current!, {
                      backgroundColor: '#0f172a',
                      style: {
                        padding: '20px'
                      }
                    });
                    const link = document.createElement('a');
                    link.download = `windfighter-telemetry-${new Date().toISOString().split('T')[0]}.png`;
                    link.href = dataUrl;
                    link.click();
                  } catch (error) {
                    console.error('Failed to export chart:', error);
                    alert('Ошибка при экспорте графика');
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        chartToggles={chartToggles}
        setChartToggles={setChartToggles}
        chartView={chartView}
        setChartView={setChartView}
        hideIdlePeriods={hideIdlePeriods}
        setHideIdlePeriods={setHideIdlePeriods}
        timeFilter={timeFilter}
        setTimeFilter={setTimeFilter}
      />
    </div>
  );
}

export default App;
