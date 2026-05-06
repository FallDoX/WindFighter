import { useState, useMemo, useEffect } from 'react';
import { detectAccelerations, type AccelerationConfig } from '../utils/acceleration';
import type { TripEntry, ThresholdPair } from '../types';

/**
 * Custom hook for managing acceleration detection state and configuration.
 *
 * This hook handles:
 * - Threshold configuration with presets
 * - Column selection for display
 * - Incomplete attempt filtering
 * - Acceleration detection from telemetry data
 * - Speed source selection (GPS/Wheel)
 * - localStorage persistence of settings
 *
 * @param data - Array of telemetry entries for acceleration detection
 * @returns Object containing acceleration attempts and state management functions
 *
 * @example
 * ```typescript
 * const { accelerationAttempts, showIncomplete, setShowIncomplete, speedSource, setSpeedSource } = useAccelerationState(tripData);
 * ```
 */
export function useAccelerationState(data: TripEntry[]) {
  // Initialize thresholdPairs from localStorage with lazy initialization
  const [thresholdPairs, setThresholdPairs] = useState<ThresholdPair[]>(() => {
    try {
      // Try new format first
      const saved = localStorage.getItem('acceleration_threshold_pairs');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed;
      }
      // Migration: convert old single threshold to pair
      const oldThreshold = localStorage.getItem('acceleration_threshold');
      if (oldThreshold) {
        const value = JSON.parse(oldThreshold);
        return [{ from: 0, to: value }];
      }
      // Default
      return [{ from: 0, to: 60 }];
    } catch {
      return [{ from: 0, to: 60 }];
    }
  });

  // Initialize selectedColumns from localStorage with lazy initialization
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('acceleration_selected_columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        return new Set(parsed);
      }
      return new Set(['time', 'distance', 'averagePower', 'peakPower', 'batteryDrop']);
    } catch {
      return new Set(['time', 'distance', 'averagePower', 'peakPower', 'batteryDrop']);
    }
  });

  // showIncomplete is not persisted (session-only state)
  const [showIncomplete, setShowIncomplete] = useState<boolean>(false);

  // Initialize powerThreshold from localStorage with lazy initialization (Plan 7.8)
  const [powerThreshold, setPowerThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('power_threshold');
      if (saved) {
        return JSON.parse(saved);
      }
      return 2500; // Default 2500W
    } catch {
      return 2500;
    }
  });

  // Initialize temperatureThreshold from localStorage with lazy initialization (Plan 7.8)
  const [temperatureThreshold, setTemperatureThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('temperature_threshold');
      if (saved) {
        return JSON.parse(saved);
      }
      return 45; // Default 45°C
    } catch {
      return 45;
    }
  });

  // Initialize speedSource from localStorage with lazy initialization
  const [speedSource, setSpeedSource] = useState<'gps' | 'wheel'>(() => {
    try {
      const saved = localStorage.getItem('speed_source');
      if (saved) {
        return JSON.parse(saved);
      }
      return 'wheel'; // Default to wheel speed
    } catch {
      return 'wheel';
    }
  });

  // Initialize speed correction settings from localStorage
  const [speedCorrection, setSpeedCorrection] = useState(() => {
    try {
      const saved = localStorage.getItem('speed_correction');
      if (saved) {
        return JSON.parse(saved);
      }
      return {
        enabled: false,
        coefficient: 1.0, // Correction coefficient
        wheelError: 0, // Percentage error
      };
    } catch {
      return {
        enabled: false,
        coefficient: 1.0,
        wheelError: 0,
      };
    }
  });

  // Initialize detectionConfig from localStorage with lazy initialization
  const [detectionConfig, setDetectionConfig] = useState<AccelerationConfig>(() => {
    try {
      const saved = localStorage.getItem('detection_config');
      if (saved) {
        const config = JSON.parse(saved);
        // Check if old config with higher thresholds - update to new sensitive defaults
        if (config.minAcceleration >= 0.5 || config.minSpeedChange >= 3 || config.dataGapThreshold < 1000) {
          // Clear old config and use new defaults
          localStorage.removeItem('detection_config');
        } else {
          return config;
        }
      }
      // Return updated default config with more sensitive parameters
      return {
        minAcceleration: 0.2, // 0.2 m/s² ≈ 0.72 km/h/s - более чувствительно к плавным разгонам
        dataGapThreshold: 2000, // 2000 ms - менее чувствительно к мелким разрывам
        minSpeedChange: 1, // 1 km/h minimum change - более чувствительно
        maxDeceleration: -1.5, // -1.5 m/s² for braking detection
        minAttemptDuration: 2000, // 2 seconds minimum
        maxAttemptDuration: 30000, // 30 seconds maximum
        minDistance: 5, // 5 meters minimum
        minPeakPower: 300, // 300 watts minimum - ниже порог для плавных разгонов
        powerConsistencyThreshold: 0.4, // 40% consistency minimum - менее строго
      };
    } catch {
      return {
        minAcceleration: 0.2, // 0.2 m/s² ≈ 0.72 км/ч/с - более чувствительно к плавным разгонам
        dataGapThreshold: 2000, // 2000 ms - менее чувствительно к мелким разрывам
        minSpeedChange: 1, // 1 km/h minimum change - более чувствительно
        maxDeceleration: -1.5, // -1.5 m/s² for braking detection
        minAttemptDuration: 2000, // 2 seconds minimum
        maxAttemptDuration: 30000, // 30 seconds maximum
        minDistance: 5, // 5 meters minimum
        minPeakPower: 300, // 300 watts minimum - ниже порог для плавных разгонов
        powerConsistencyThreshold: 0.4, // 40% consistency minimum - менее строго
      };
    }
  });

  // Memoize acceleration detection to prevent re-detection on unnecessary re-renders
  const accelerationAttempts = useMemo(() => {
    console.log('🔍 useAccelerationState: Запуск детекции');
    console.log('   📊 Данных:', data.length);
    console.log('   🎯 Диапазоны:', thresholdPairs);
    console.log('   ⚙️ Конфиг:', detectionConfig);
    
    const attempts = detectAccelerations(data, thresholdPairs, detectionConfig, speedSource, speedCorrection.enabled ? speedCorrection : undefined);
    
    console.log('🚀 useAccelerationState: Найдено попыток:', attempts.length);
    
    return attempts;
  }, [data, thresholdPairs, detectionConfig, speedSource, speedCorrection.enabled, speedCorrection.coefficient]);

  // Persist thresholdPairs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('acceleration_threshold_pairs', JSON.stringify(thresholdPairs));
    } catch {
      // Silent fail - localStorage unavailable
    }
  }, [thresholdPairs]);

  // Persist selectedColumns to localStorage
  useEffect(() => {
    try {
      const arrayValue = Array.from(selectedColumns);
      localStorage.setItem('acceleration_selected_columns', JSON.stringify(arrayValue));
    } catch {
      // Silent fail - localStorage unavailable
    }
  }, [selectedColumns]);

  // Persist powerThreshold to localStorage (Plan 7.8)
  useEffect(() => {
    try {
      localStorage.setItem('power_threshold', JSON.stringify(powerThreshold));
    } catch {
      // Silent fail - localStorage unavailable
    }
  }, [powerThreshold]);

  // Persist temperatureThreshold to localStorage (Plan 7.8)
  useEffect(() => {
    try {
      localStorage.setItem('temperature_threshold', JSON.stringify(temperatureThreshold));
    } catch {
      // Silent fail - localStorage unavailable
    }
  }, [temperatureThreshold]);

  // Persist speedSource to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('speed_source', JSON.stringify(speedSource));
    } catch {
      // Silent fail - localStorage unavailable
    }
  }, [speedSource]);

  // Persist speed correction to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('speed_correction', JSON.stringify(speedCorrection));
    } catch {
      // Silent fail - localStorage unavailable
    }
  }, [speedCorrection]);

  // Persist detectionConfig to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('detection_config', JSON.stringify(detectionConfig));
    } catch {
      // Silent fail - localStorage unavailable
    }
  }, [detectionConfig]);

  // Clear settings function
  const clearSettings = (): boolean => {
    try {
      localStorage.removeItem('acceleration_threshold_pairs');
      localStorage.removeItem('acceleration_threshold'); // Remove old key
      localStorage.removeItem('acceleration_selected_columns');
      localStorage.removeItem('power_threshold'); // Plan 7.8
      localStorage.removeItem('temperature_threshold'); // Plan 7.8
      localStorage.removeItem('speed_source');
      localStorage.removeItem('speed_correction');
      localStorage.removeItem('detection_config');
      return true;
    } catch {
      return false;
    }
  };

  return {
    accelerationAttempts,
    thresholdPairs,
    setThresholdPairs,
    showIncomplete,
    setShowIncomplete,
    selectedColumns,
    setSelectedColumns,
    clearSettings,
    powerThreshold, // Plan 7.8
    setPowerThreshold, // Plan 7.8
    temperatureThreshold, // Plan 7.8
    setTemperatureThreshold, // Plan 7.8
    speedSource,
    setSpeedSource,
    speedCorrection,
    setSpeedCorrection,
    detectionConfig,
    setDetectionConfig,
  };
}

export default useAccelerationState;
