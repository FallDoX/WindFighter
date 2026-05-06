import type { TripEntry, AccelerationAttempt, ThresholdPair } from '../types.js';

/**
 * Configuration for acceleration detection algorithm
 */
export interface AccelerationConfig {
  minAcceleration: number; // m/s² - minimum acceleration to start attempt
  dataGapThreshold: number; // ms - maximum time gap between data points
  minSpeedChange: number; // km/h - minimum speed change to consider
  maxDeceleration: number; // m/s² - maximum deceleration before ending attempt
  minAttemptDuration: number; // ms - minimum duration for valid attempt
  maxAttemptDuration: number; // ms - maximum duration for valid attempt
  minDistance: number; // meters - minimum distance for valid attempt
  minPeakPower: number; // watts - minimum peak power for valid attempt
  powerConsistencyThreshold: number; // 0-1 - minimum power consistency for valid attempt
}

const DEFAULT_CONFIG: AccelerationConfig = {
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

/**
 * Get speed based on selected source with optional correction
 * @param entry - telemetry entry
 * @param source - 'gps' for GPS speed, 'wheel' for wheel speed
 * @param correction - speed correction settings
 */
function getSpeed(entry: TripEntry, source: 'gps' | 'wheel', correction?: { enabled: boolean; coefficient: number }): number {
  if (source === 'gps') {
    // Use GPS speed when available, fallback to wheel speed
    return entry.GPSSpeed !== null && entry.GPSSpeed > 0 ? entry.GPSSpeed : entry.Speed;
  } else {
    // Use wheel speed with optional correction
    const wheelSpeed = entry.Speed;
    if (correction?.enabled) {
      return wheelSpeed * correction.coefficient;
    }
    return wheelSpeed;
  }
}

/**
 * Calculate speed correction coefficient based on GPS vs wheel speed comparison
 * @param data - telemetry data
 * @returns Correction coefficient and wheel error percentage
 */
export function calculateSpeedCorrection(data: TripEntry[]): { coefficient: number; wheelError: number } {
  const validData = data.filter(entry => 
    entry.GPSSpeed !== null && 
    entry.GPSSpeed > 0 && 
    entry.Speed > 0 &&
    entry.GPSSpeed < 150 && // Filter unrealistic GPS speeds
    entry.Speed < 150 // Filter unrealistic wheel speeds
  );

  if (validData.length < 10) {
    return { coefficient: 1.0, wheelError: 0 };
  }

  // Calculate ratio differences
  const ratios = validData.map(entry => entry.Speed / entry.GPSSpeed!);
  
  // Remove outliers (more than 2 standard deviations)
  const mean = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  const variance = ratios.reduce((sum, ratio) => sum + Math.pow(ratio - mean, 2), 0) / ratios.length;
  const stdDev = Math.sqrt(variance);
  
  const filteredRatios = ratios.filter(ratio => 
    Math.abs(ratio - mean) <= 2 * stdDev
  );

  if (filteredRatios.length === 0) {
    return { coefficient: 1.0, wheelError: 0 };
  }

  // Calculate final correction coefficient
  const finalMean = filteredRatios.reduce((sum, ratio) => sum + ratio, 0) / filteredRatios.length;
  const coefficient = 1.0 / finalMean; // Invert to correct wheel speed
  const wheelError = ((1 - finalMean) * 100); // Percentage error

  return {
    coefficient: Math.max(0.5, Math.min(2.0, coefficient)), // Clamp between 0.5 and 2.0
    wheelError: Math.round(wheelError * 10) / 10 // Round to 1 decimal
  };
}

/**
 * Detects acceleration attempts from telemetry data using improved algorithm.
 *
 * This function detects acceleration attempts for any speed range, supporting:
 * - Roll-on acceleration (from any starting speed)
 * - Traditional 0-to-X acceleration
 * - Custom speed ranges (e.g., 30-60, 50-80)
 * - Robust data gap handling
 * - Quality validation
 *
 * @param data - Array of telemetry entries
 * @param thresholdPairs - Array of speed ranges to detect
 * @param config - Optional configuration for detection parameters
 * @returns Array of acceleration attempts with comprehensive metrics
 *
 * @example
 * ```typescript
 * // Traditional 0-60
 * const attempts = detectAccelerations(tripData, [{from: 0, to: 60}]);
 * 
 * // Roll-on acceleration 30-80
 * const highwayAttempts = detectAccelerations(tripData, [{from: 30, to: 80}]);
 * 
 * // Multiple ranges
 * const allAttempts = detectAccelerations(tripData, [
 *   {from: 0, to: 60}, 
 *   {from: 30, to: 80}, 
 *   {from: 50, to: 100}
 * ]);
 * ```
 */
export function detectAccelerations(
  data: TripEntry[], 
  thresholdPairs: ThresholdPair[], 
  config: Partial<AccelerationConfig> = {},
  speedSource: 'gps' | 'wheel' = 'gps',
  speedCorrection?: { enabled: boolean; coefficient: number }
): AccelerationAttempt[] {
  const attempts: AccelerationAttempt[] = [];
  
  if (data.length === 0 || thresholdPairs.length === 0) {
    return attempts;
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Track active attempts for each threshold pair
  const attemptTracking = new Map<ThresholdPair, {
    startIndex: number;
    startSpeed: number;
    inAcceleration: boolean;
    lastAcceleration: number;
    isTraditional: boolean; // true for 0-to-X, false for roll-on
    wasAtZero: boolean; // for traditional acceleration only
  }>();
  
  for (const pair of thresholdPairs) {
    const isTraditional = pair.from === 0;
    attemptTracking.set(pair, {
      startIndex: 0,
      startSpeed: 0,
      inAcceleration: false,
      lastAcceleration: 0,
      isTraditional,
      wasAtZero: false
    });
  }

  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];
    
    // Calculate acceleration
    const timeDiff = (current.timestamp - previous.timestamp) / 1000; // seconds
    const currentSpeed = getSpeed(current, speedSource, speedCorrection);
    const previousSpeed = getSpeed(previous, speedSource, speedCorrection);
    const speedDiff = currentSpeed - previousSpeed; // km/h
    const acceleration = (speedDiff * 1000 / 3600) / timeDiff; // m/s²

    // Check for significant data gaps
    if (timeDiff > cfg.dataGapThreshold / 1000) {
      // Reset all attempts on major gap
      for (const [, tracking] of attemptTracking) {
        tracking.inAcceleration = false;
        tracking.lastAcceleration = 0;
        tracking.wasAtZero = false;
      }
      continue;
    }

    // Check each threshold pair
    for (const [pair, tracking] of attemptTracking) {
      const currentSpeed = getSpeed(current, speedSource, speedCorrection);
      const previousSpeed = getSpeed(previous, speedSource, speedCorrection);
      const inSpeedRange = currentSpeed >= pair.from && currentSpeed <= pair.to;
      const wasInSpeedRange = previousSpeed >= pair.from && previousSpeed <= pair.to;

      // Start acceleration detection logic
      if (!tracking.inAcceleration) {
        let shouldStart = false;
        
        if (tracking.isTraditional) {
          // Traditional 0-to-X acceleration: require full stop first
          const isAtZero = currentSpeed < 1; // Full stop detection (< 1 km/h)
          if (isAtZero) {
            tracking.wasAtZero = true;
          } else if (tracking.wasAtZero && 
                     inSpeedRange && 
                     currentSpeed > 1 && // Start counting after > 1 km/h (убрали мертвую зону)
                     acceleration >= cfg.minAcceleration &&
                     Math.abs(speedDiff) >= cfg.minSpeedChange) {
            shouldStart = true;
          }
        } else {
          // Roll-on acceleration: start when in range (no stop required)
          if (inSpeedRange && 
              acceleration >= cfg.minAcceleration &&
              Math.abs(speedDiff) >= cfg.minSpeedChange) {
            shouldStart = true;
          }
        }
        
        if (shouldStart) {
          tracking.inAcceleration = true;
          tracking.startIndex = i - 1;
          tracking.startSpeed = previousSpeed;
          tracking.lastAcceleration = acceleration;
        }
      } else {
        // Already in acceleration - check for end conditions
        const shouldEnd = 
          // Reached target speed
          currentSpeed >= pair.to ||
          // Exited speed range downward (significant deceleration)
          (acceleration < cfg.maxDeceleration && !inSpeedRange) ||
          // Left speed range upward (overshoot)
          (!wasInSpeedRange && !inSpeedRange && currentSpeed > pair.to);

        if (shouldEnd) {
          const attemptData = data.slice(tracking.startIndex, i + 1);
          const attempt = calculateAttemptMetrics(
            attemptData, 
            pair, 
            tracking.startIndex, 
            i, 
            currentSpeed >= pair.to,
            speedSource,
            speedCorrection
          );
          
          if (attempt) {
            attempts.push(attempt);
          }

          // Reset tracking
          tracking.inAcceleration = false;
          tracking.lastAcceleration = 0;
          if (tracking.isTraditional) {
            tracking.wasAtZero = false;
          }
        } else {
          tracking.lastAcceleration = acceleration;
        }
      }
    }
  }

  // Handle incomplete attempts (still in acceleration at end of data)
  for (const [pair, tracking] of attemptTracking) {
    if (tracking.inAcceleration) {
      const attemptData = data.slice(tracking.startIndex);
      const attempt = calculateAttemptMetrics(
        attemptData, 
        pair, 
        tracking.startIndex, 
        data.length - 1, 
        false,
        speedSource
      );
      
      if (attempt) {
        attempts.push(attempt);
      }
    }
  }

  return attempts;
}

/**
 * Calculate comprehensive metrics for an acceleration attempt
 */
function calculateAttemptMetrics(
  attemptData: TripEntry[], 
  thresholdPair: ThresholdPair,
  startIndex: number,
  endIndex: number,
  isComplete: boolean,
  speedSource: 'gps' | 'wheel',
  speedCorrection?: { enabled: boolean; coefficient: number }
): AccelerationAttempt | null {
  if (attemptData.length < 2) return null;

  const start = attemptData[0];
  
  // Find the exact point where target speed is first reached
  let actualEndIndex = attemptData.length - 1;
  let actualEnd = attemptData[actualEndIndex];
  
  if (thresholdPair.to > 0) {
    for (let i = 0; i < attemptData.length; i++) {
      const speed = getSpeed(attemptData[i], speedSource, speedCorrection);
      if (speed >= thresholdPair.to) {
        actualEndIndex = i;
        actualEnd = attemptData[i];
        break;
      }
    }
  }
  
  // Trim data to the actual end point
  const trimmedAttemptData = attemptData.slice(0, actualEndIndex + 1);
  const end = actualEnd;
  
  // Basic metrics
  const time = (end.timestamp - start.timestamp) / 1000; // seconds
  
  // Calculate distance using trapezoidal integration with selected speed source
  let distance = 0;
  for (let i = 0; i < trimmedAttemptData.length - 1; i++) {
    const point1 = trimmedAttemptData[i];
    const point2 = trimmedAttemptData[i + 1];
    const dt = (point2.timestamp - point1.timestamp) / 1000; // seconds
    const speed1 = getSpeed(point1, speedSource, speedCorrection) / 3.6; // convert km/h to m/s
    const speed2 = getSpeed(point2, speedSource, speedCorrection) / 3.6; // convert km/h to m/s
    distance += ((speed1 + speed2) / 2) * dt; // trapezoidal method
  }

  // Extract metric arrays
  const powerValues = trimmedAttemptData.map(d => d.Power);
  const currentValues = trimmedAttemptData.map(d => d.Current);
  const voltageValues = trimmedAttemptData.map(d => d.Voltage);
  const temperatureValues = trimmedAttemptData.map(d => d.Temperature);

  // Basic statistics
  const averagePower = powerValues.reduce((sum, val) => sum + val, 0) / powerValues.length;
  const peakPower = Math.max(...powerValues);
  const averageCurrent = currentValues.reduce((sum, val) => sum + val, 0) / currentValues.length;
  const averageVoltage = voltageValues.reduce((sum, val) => sum + val, 0) / voltageValues.length;
  const batteryDrop = start.BatteryLevel - end.BatteryLevel; // Positive = drop
  const averageTemperature = temperatureValues.reduce((sum, val) => sum + val, 0) / temperatureValues.length;

  // Advanced power metrics
  const startSpeed = getSpeed(start, speedSource, speedCorrection);
  const endSpeed = getSpeed(end, speedSource, speedCorrection);
  const speedDelta = endSpeed - startSpeed;
  const powerEfficiency = speedDelta > 0 ? averagePower / speedDelta : 0; // W per km/h
  
  // Power consistency (coefficient of variation)
  const powerMean = averagePower;
  const powerVariance = powerValues.reduce((sum, val) => sum + Math.pow(val - powerMean, 2), 0) / powerValues.length;
  const powerStdDev = Math.sqrt(powerVariance);
  const powerConsistency = powerMean > 0 ? 1 - (powerStdDev / powerMean) : 1;
  
  // Power distribution
  const powerDistribution = {
    low: powerValues.filter(v => v < 1000).length / powerValues.length,
    medium: powerValues.filter(v => v >= 1000 && v < 2000).length / powerValues.length,
    high: powerValues.filter(v => v >= 2000).length / powerValues.length
  };

  // Battery impact metrics
  const batteryDropRate = time > 0 ? batteryDrop / time : 0; // % per second
  const energyUsed = averagePower * time / 3600; // Wh
  const energyPerKm = distance > 0 ? energyUsed / (distance / 1000) : 0; // Wh/km

  // Temperature-power correlation
  let temperaturePowerCorrelation = 0;
  if (temperatureValues.length > 1 && powerValues.length > 1) {
    const tempMean = averageTemperature;
    const powerMeanCalc = averagePower;
    let numerator = 0;
    let tempStdDevSum = 0;
    let powerStdDevSum = 0;
    
    for (let j = 0; j < temperatureValues.length; j++) {
      const tempDiff = temperatureValues[j] - tempMean;
      const powerDiff = powerValues[j] - powerMeanCalc;
      numerator += tempDiff * powerDiff;
      tempStdDevSum += tempDiff * tempDiff;
      powerStdDevSum += powerDiff * powerDiff;
    }
    
    const tempStdDev = Math.sqrt(tempStdDevSum);
    const powerStdDevCalc = Math.sqrt(powerStdDevSum);
    temperaturePowerCorrelation = (tempStdDev > 0 && powerStdDevCalc > 0) 
      ? numerator / (tempStdDev * powerStdDevCalc) 
      : 0;
  }

  // Temperature efficiency (optimal range 20-35°C)
  const tempEff = averageTemperature;
  let temperatureEfficiency = 1;
  if (tempEff < 20) {
    temperatureEfficiency = Math.max(0, tempEff / 20);
  } else if (tempEff > 35) {
    temperatureEfficiency = Math.max(0, 1 - (tempEff - 35) / 20);
  }

  return {
    id: `accel-${startIndex}-${endIndex}-${thresholdPair.from}-${thresholdPair.to}`,
    startTimestamp: start.timestamp,
    endTimestamp: end.timestamp,
    startSpeed: startSpeed,
    endSpeed: endSpeed,
    targetSpeed: thresholdPair.to, // Keep for backward compatibility
    thresholdPair: thresholdPair,
    time: time,
    distance: distance,
    averagePower: averagePower,
    peakPower: peakPower,
    averageCurrent: averageCurrent,
    averageVoltage: averageVoltage,
    batteryDrop: batteryDrop,
    averageTemperature: averageTemperature,
    isComplete: isComplete,
    // Advanced metrics
    powerEfficiency,
    powerConsistency: Math.max(0, Math.min(1, powerConsistency)), // Clamp to 0-1
    powerDistribution,
    batteryDropRate,
    energyPerKm,
    temperaturePowerCorrelation,
    temperatureEfficiency
  };
}
