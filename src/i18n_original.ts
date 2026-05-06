export type Language = 'en' | 'ru';

export const translations = {
  en: {
    // Header
    appTitle: 'WindFighter EUC',
    appSubtitle: 'EUC telemetry',
    uploadCSV: 'Upload CSV',
    dropCSV: 'Drop CSV File',
    dropCSVSubtitle: 'Processing your telemetry data...',
    parsingData: 'Parsing telemetry data...',
    readyToAnalyze: 'Ready to Analyze',
    uploadPrompt: 'Drag and drop your trip CSV file here or use the upload button to visualize your journey telemetry.',

    // Display Settings
    displaySettings: 'Display Settings',
    visibleMetrics: 'Visible Metrics',
    dataFilter: 'Data Filter',
    hideIdlePeriods: 'Hide Idle Periods',
    filterEnabled: 'Enabled',
    filterDisabled: 'Disabled',
    idlePeriodsEnabled: 'Enabled',
    idlePeriodsDisabled: 'Disabled',
    idlePeriodsDesc: 'Hides periods with speed < 5 km/h for > 30 seconds',
    filterDesc: 'Filter removes: gaps > 10sec, GPS teleportation > 200km/h or > 500m in 5sec, GPS rollback, stuck GPS',
    filteredRecords: 'Filtered: {{count}} records',

    // Chart
    tripTelemetry: 'Trip Telemetry',
    zoomInfo: 'Zoom: {{minutes}} min ({{percent}}%)',
    zoomIn: 'Zoom In',
    resetZoom: 'Reset Zoom',
    chartTypeLine: '📈 Line',
    chartTypeScatter: '🔵 Scatter',

    // Metrics
    speed: 'Speed',
    gpsSpeed: 'GPS Speed',
    power: 'Power',
    current: 'Current',
    phaseCurrent: 'Phase I',
    voltage: 'Voltage',
    batteryPercent: 'Battery %',
    temp: 'Temp',
    temp2: 'Temp 2',
    torque: 'Torque',
    pwm: 'PWM',

    // Summary Cards
    maxSpeed: 'Max Speed',
    avgSpeed: 'Avg Speed',
    avgMovingSpeed: 'Avg Moving',
    distance: 'Distance',
    movingTime: 'Moving Time',
    maxPower: 'Max Power',
    batteryDrop: 'Battery Drop',
    batteryDischarge: 'Battery Discharge',
    batteryVoltageDrop: 'Voltage Drop',
    maxBatteryDrop: 'Max Drop',
    consumption: 'Consumption',
    maxCurrent: 'Max Current',
    duration: 'Duration',
    totalSamples: 'Samples',
    peakAcceleration: 'Peak Accel',
    best060: '0-60 Time',
    maxTorque: 'Max Torque',
    maxPhaseI: 'Max Phase I',
    avgTemp: 'Avg Temp',
    maxTemp: 'Max Temp',
    ridingTime: 'Riding Time',

    // Acceleration Analysis
    accelerationAnalysis: 'Acceleration Analysis',
    accelerationResults: 'Acceleration Results',
    noAccelerationData: 'No acceleration data from standstill.',
    needZeroSpeed: 'For acceleration measurement, a log starting from 0 km/h is required.',
    timeToSpeed: '{{speed}} km/h',
    peak: 'peak',

    // Scatter Plot
    axisX: 'X Axis',
    axisY: 'Y Axis',
    color: 'Color',

    // Timeline
    scale: 'Scale',
    reset: 'Reset',
    mobileHint: '📱 Mobile: 1 finger = pan | 2 fingers = pinch-zoom | 👆 Zoom buttons',
    desktopHint: '💻 PC: Horizontal swipe = pan | Shift+Scroll = zoom | Double click = zoom in',

    // File
    uploadError: 'Please upload a CSV file',

    // New UI Elements
    hideIdlePeriodsTitle: 'Hide Idle Periods',
    dataFilterTitle: 'Data Filter',
    shareTitle: 'Share',
    floatingPanelTitle: 'Floating Panel',
    snapModeTitle: 'Snap Mode',
    panelOn: 'Panel ON',
    panelOff: 'Panel OFF',
    snapOn: 'Snap ON',
    snapOff: 'Snap OFF',
    enabled: 'Enabled',
    disabled: 'Disabled',
    on: 'ON',
    off: 'OFF',

    // Tooltips
    tooltipIdlePeriods: 'Removes idle periods from the chart',
    tooltipDataFilter: 'Removes data anomalies (configurable)',
    tooltipShare: 'Screenshot of the entire page',
    tooltipFloatingPanel: 'Toggle floating data panel',
    tooltipSnapMode: 'Snap to data points on hover',
    tooltipZoomIn: 'Zoom In',
    tooltipResetZoom: 'Reset Zoom',

    // Data Panel
    dataPanelTitle: 'Data Panel',
    noData: 'No data',
    locked: 'LOCKED',
    unlock: 'Unlock',
    lock: 'Lock',

    // Messages
    noDataToSave: 'No data to save. Please upload a CSV file.',
    exportContainerNotFound: 'Export container not found',
    screenshotError: 'Error creating screenshot',
    demoLoadError: 'Error loading demo file',

    // Units and labels
    ms: 'ms',
    sec: 's',
    ms2: 'm/s²',
    kmh: 'km/h',
    watt: 'W',
    amp: 'A',
    volt: 'V',
    percent: '%',
    celsius: '°C',
    km: 'km',
    wh: 'Wh',
    whkm: 'Wh/km',
  },
  ru: {
    // Header
    appTitle: 'WindFighter Telemetry',
    appSubtitle: 'EUC Telemetry',
    uploadCSV: 'Upload CSV',
    dropCSV: 'Drop CSV File',
    dropCSVSubtitle: 'Processing your telemetry data...',
    parsingData: 'Parsing telemetry data...',
    readyToAnalyze: 'Ready to Analyze',
    uploadPrompt: 'Drag and drop your trip CSV file here or use the upload button to visualize your journey telemetry.',

    // Display Settings
    displaySettings: 'Display Settings',
    visibleMetrics: 'Visible Metrics',
    dataFilter: 'Data Filter',
    hideIdlePeriods: 'Hide Idle Periods',
    filterEnabled: 'Enabled',
    filterDisabled: 'Disabled',
    idlePeriodsEnabled: 'Enabled',
    idlePeriodsDisabled: 'Disabled',
    idlePeriodsDesc: 'Hides periods with speed < 5 km/h for > 30 seconds',
    filterDesc: 'Filter removes: gaps > 10sec, GPS teleportation > 200km/h or > 500m in 5sec, GPS rollback, stuck GPS',
    filteredRecords: 'Отфильтровано: {{count}} записей',

    // Chart
    tripTelemetry: 'Телеметрия поездки',
    zoomInfo: 'Zoom: {{minutes}} min ({{percent}}%)',
    zoomIn: 'Zoom In',
    resetZoom: 'Reset Zoom',
    chartTypeLine: '📈 Line',
    chartTypeScatter: '🔵 Scatter',

    // Metrics
    speed: 'Speed',
    gpsSpeed: 'GPS Speed',
    power: 'Power',
    current: 'Current',
    phaseCurrent: 'Phase Current',
    voltage: 'Voltage',
    batteryPercent: 'Battery %',
    temp: 'Temp',
    temp2: 'Temp 2',
    torque: 'Torque',
    pwm: 'PWM',

    // Summary Cards
    maxSpeed: 'Max Speed',
    avgSpeed: 'Avg Speed',
    avgMovingSpeed: 'Avg Moving',
    distance: 'Distance',
    movingTime: 'Moving Time',
    maxPower: 'Max Power',
    batteryDrop: 'Battery Drop',
    batteryDischarge: 'Battery Discharge',
    batteryVoltageDrop: 'Voltage Drop',
    maxBatteryDrop: 'Max Drop',
    consumption: 'Consumption',
    maxCurrent: 'Max Current',
    duration: 'Duration',
    totalSamples: 'Samples',
    peakAcceleration: 'Peak Accel',
    best060: '0-60 Time',
    maxTorque: 'Max Torque',
    maxPhaseI: 'Max Phase I',
    avgTemp: 'Avg Temp',
    maxTemp: 'Max Temp',
    ridingTime: 'Riding Time',

    // Acceleration Analysis
    accelerationAnalysis: 'Acceleration Analysis',
    accelerationResults: 'Acceleration Results',
    noAccelerationData: 'No acceleration data from standstill.',
    needZeroSpeed: 'For acceleration measurement, a log starting from 0 km/h is required.',
    timeToSpeed: '{{speed}} km/h',
    peak: 'peak',

    // Scatter Plot
    axisX: 'X Axis',
    axisY: 'Y Axis',
    color: 'Color',

    // Timeline
    scale: 'Scale',
    reset: 'Reset',
    mobileHint: '📱 Mobile: 1 finger = pan | 2 fingers = pinch-zoom | 👆 Zoom buttons',
    desktopHint: '💻 PC: Horizontal swipe = pan | Shift+Scroll = zoom | Double click = zoom in',

    // File
    uploadError: 'Please upload a CSV file',

    // New UI Elements
    hideIdlePeriodsTitle: 'Hide Idle Periods',
    dataFilterTitle: 'Data Filter',
    shareTitle: 'Share',
    floatingPanelTitle: 'Floating Panel',
    snapModeTitle: 'Snap Mode',
    panelOn: 'Panel ON',
    panelOff: 'Panel OFF',
    snapOn: 'Snap ON',
    snapOff: 'Snap OFF',
    enabled: 'Enabled',
    disabled: 'Disabled',
    on: 'ON',
    off: 'OFF',

    // Tooltips
    tooltipIdlePeriods: 'Removes idle periods from chart',
    tooltipDataFilter: 'Removes data anomalies (configurable)',
    tooltipShare: 'Screenshot of the entire page',
    tooltipFloatingPanel: 'Toggle floating data panel',
    tooltipSnapMode: 'Snap to data points on hover',
    tooltipZoomIn: 'Zoom In',
    tooltipResetZoom: 'Reset Zoom',

    // Data Panel
    dataPanelTitle: 'Data Panel',
    noData: 'No data',
    locked: 'LOCKED',
    unlock: 'Unlock',
    lock: 'Lock',

    // Messages
    noDataToSave: 'No data to save. Please upload a CSV file.',
    exportContainerNotFound: 'Export container not found',
    screenshotError: 'Error creating screenshot',
    demoLoadError: 'Error loading demo file',

    // Units and labels
    ms: 'ms',
    sec: 's',
    ms2: 'm/s²',
    kmh: 'km/h',
    watt: 'W',
    amp: 'A',
    volt: 'V',
    percent: '%',
    celsius: '°C',
    km: 'km',
    wh: 'Wh',
    whkm: 'Wh/km',
  }
};

// Detect browser language
export function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';
  
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('ru')) return 'ru';
  return 'en';
}

// Create i18n hook
export function createI18n() {
  let currentLang: Language = detectLanguage();
  
  const t = (key: keyof typeof translations.en, params?: Record<string, string | number>): string => {
    let text = translations[currentLang][key] || translations.en[key] || key;
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{{${k}}}`, String(v));
      });
    }
    
    return text;
  };
  
  const setLanguage = (lang: Language) => {
    currentLang = lang;
  };
  
  const getLanguage = () => currentLang;
  
  return { t, setLanguage, getLanguage };
}

// Singleton instance
export const i18n = createI18n();
