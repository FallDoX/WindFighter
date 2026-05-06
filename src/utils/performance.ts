// Utility functions for performance optimization

/**
 * Throttle function - limits execution to once per wait period
 * @param func Function to throttle
 * @param wait Wait time in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let previous = 0;

  return function (...args: Parameters<T>) {
    const now = Date.now();
    const remaining = wait - (now - previous);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        func(...args);
      }, remaining);
    }
  };
}

/**
 * Debounce function - delays execution until after wait period of inactivity
 * @param func Function to debounce
 * @param wait Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * Memoize function results
 * @param func Function to memoize
 * @returns Memoized function
 */
export function memoize<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T
): (...args: Parameters<T>) => ReturnType<T> {
  const cache = new Map<string, ReturnType<T>>();

  return function (...args: Parameters<T>): ReturnType<T> {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = func(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Batch process array in chunks to avoid blocking UI
 * @param array Array to process
 * @param batchSize Size of each batch
 * @param processFn Function to process each item
 * @param onComplete Callback when processing is complete
 */
export function processInBatches<T, R>(
  array: T[],
  batchSize: number,
  processFn: (item: T) => R,
  onComplete?: (results: R[]) => void
): Promise<R[]> {
  return new Promise((resolve) => {
    const results: R[] = [];
    let index = 0;

    function processBatch() {
      const batch = array.slice(index, index + batchSize);
      
      for (const item of batch) {
        results.push(processFn(item));
      }
      
      index += batchSize;

      if (index < array.length) {
        // Yield to UI thread
        requestAnimationFrame(processBatch);
      } else {
        onComplete?.(results);
        resolve(results);
      }
    }

    processBatch();
  });
}

/**
 * Measure function execution time for profiling
 * @param name Name of the measurement
 * @param fn Function to measure
 * @returns Result of the function
 */
export function measurePerformance<T>(name: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  console.log(`[Performance] ${name}: ${(end - start).toFixed(2)}ms`);
  return result;
}
