const fs = require('fs');
const path = require('path');

// Импортируем функции детекции (адаптированные для Node.js)
function parseTripData(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const entry = {};
    
    headers.forEach((header, index) => {
      const value = values[index];
      
      if (header === 'date' || header === 'time' || header === 'mode' || header === 'alert') {
        entry[header] = value;
      } else if (header === 'timestamp') {
        entry[header] = parseInt(value) || 0;
      } else {
        entry[header] = parseFloat(value) || 0;
      }
    });
    
    // Создаем timestamp из даты и времени
    if (entry.date && entry.time) {
      const dateTimeStr = `${entry.date}T${entry.time}`;
      entry.timestamp = new Date(dateTimeStr).getTime();
    }
    
    // Обрабатываем GPS скорость
    entry.GPSSpeed = entry.gps_speed || null;
    
    data.push(entry);
  }
  
  return data;
}

function getSpeed(entry, source = 'wheel') {
  if (source === 'gps') {
    return entry.GPSSpeed !== null && entry.GPSSpeed > 0 ? entry.GPSSpeed : entry.speed;
  }
  return entry.speed;
}

function detectAccelerations(data, thresholdPairs, config = {}) {
  const attempts = [];
  
  if (data.length === 0 || thresholdPairs.length === 0) {
    return attempts;
  }

  const cfg = {
    minAcceleration: 0.2,
    dataGapThreshold: 2000, // Исправлено: 2000ms вместо 500ms
    minSpeedChange: 1,
    maxDeceleration: -1.5,
    minAttemptDuration: 2000,
    maxAttemptDuration: 30000,
    minDistance: 5,
    minPeakPower: 300,
    powerConsistencyThreshold: 0.4,
    ...config
  };

  console.log(`🔧 Используемая конфигурация:`);
  console.log(`   dataGapThreshold: ${cfg.dataGapThreshold}ms`);

  const attemptTracking = new Map();
  
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

  let gapCount = 0;

  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];
    
    const timeDiff = (current.timestamp - previous.timestamp) / 1000;
    const currentSpeed = getSpeed(current, 'wheel');
    const previousSpeed = getSpeed(previous, 'wheel');
    const speedDiff = currentSpeed - previousSpeed;
    const acceleration = (speedDiff * 1000 / 3600) / timeDiff;

    if (timeDiff > cfg.dataGapThreshold / 1000) {
      gapCount++;
      // Только считаем разрывы, но не логируем каждый
      if (gapCount <= 5) {
        console.log(`⚠️  Значительный разрыв данных ${timeDiff.toFixed(0)}ms на индексе ${i}`);
      }
      for (const [, tracking] of attemptTracking) {
        tracking.inAcceleration = false;
        tracking.lastAcceleration = 0;
        tracking.wasAtZero = false;
      }
      continue;
    }

    for (const [pair, tracking] of attemptTracking) {
      const currentSpeed = getSpeed(current, 'wheel');
      const previousSpeed = getSpeed(previous, 'wheel');
      const inSpeedRange = currentSpeed >= pair.from && currentSpeed <= pair.to;
      const wasInSpeedRange = previousSpeed >= pair.from && previousSpeed <= pair.to;

      if (!tracking.inAcceleration) {
        let shouldStart = false;
        
        if (tracking.isTraditional) {
          const isAtZero = currentSpeed < 1;
          if (isAtZero) {
            tracking.wasAtZero = true;
          } else if (tracking.wasAtZero && 
                     inSpeedRange && 
                     currentSpeed > 1 &&
                     acceleration >= cfg.minAcceleration &&
                     Math.abs(speedDiff) >= cfg.minSpeedChange) {
            shouldStart = true;
          }
        } else {
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
        const shouldEnd = 
          currentSpeed >= pair.to ||
          (acceleration < cfg.maxDeceleration && !inSpeedRange) ||
          (!wasInSpeedRange && !inSpeedRange && currentSpeed > pair.to);

        if (shouldEnd) {
          const endIndex = i;
          const duration = (data[endIndex].timestamp - data[tracking.startIndex].timestamp);
          
          if (duration >= cfg.minAttemptDuration && duration <= cfg.maxAttemptDuration) {
            const attemptData = data.slice(tracking.startIndex, endIndex + 1);
            
            const start = attemptData[0];
            const end = attemptData[attemptData.length - 1];
            const time = duration / 1000;
            const distance = end.totaldistance - start.totaldistance;
            const peakPower = Math.max(...attemptData.map(d => d.power || 0));
            
            attempts.push({
              id: `${tracking.startIndex}-${endIndex}`,
              thresholdPair: pair,
              startTimestamp: start.timestamp,
              endTimestamp: end.timestamp,
              time,
              distance,
              peakPower,
              startSpeed: tracking.startSpeed,
              endSpeed: currentSpeed,
              completed: currentSpeed >= pair.to
            });
          }
          
          tracking.inAcceleration = false;
          tracking.lastAcceleration = 0;
          tracking.wasAtZero = false;
        } else {
          tracking.lastAcceleration = acceleration;
        }
      }
    }
  }

  if (gapCount > 5) {
    console.log(`⚠️  ... и еще ${gapCount - 5} разрывов данных (не показаны)`);
  }

  return attempts;
}

// Финальный тест
async function finalTest() {
  console.log('🧪 ФИНАЛЬНЫЙ ТЕСТ ДЕТЕКТОРА УСКОРЕНИЙ\n');

  const thresholdPairs = [
    { from: 0, to: 25 },
    { from: 0, to: 60 },
    { from: 0, to: 90 },
    { from: 0, to: 100 }
  ];

  const testFiles = [
    'C:\\Users\\admin\\Downloads\\Telegram Desktop\\2026_05_05_02_48_55.csv',
    'C:\\Users\\admin\\Downloads\\Telegram Desktop\\2026_05_05_21_38_51.csv'
  ];

  for (const filePath of testFiles) {
    try {
      console.log(`📁 Тест файла: ${path.basename(filePath)}`);
      
      const csvText = fs.readFileSync(filePath, 'utf8');
      const data = parseTripData(csvText);
      
      console.log(`   📊 Записей: ${data.length}`);
      
      const attempts = detectAccelerations(data, thresholdPairs);
      
      console.log(`   🚀 Найдено попыток: ${attempts.length}`);
      
      if (attempts.length > 0) {
        attempts.forEach((attempt, index) => {
          console.log(`   ${index + 1}. ${attempt.thresholdPair.from}-${attempt.thresholdPair.to} км/ч: ${attempt.time.toFixed(2)}с, ${attempt.distance?.toFixed(1) || 'N/A'}м, ${attempt.peakPower?.toFixed(0) || 'N/A'}W`);
        });
      }
      
      // Проверка на разгон 0-87.08 км/ч
      const targetAttempt = attempts.find(a => 
        Math.abs(a.thresholdPair.from - 0) < 0.1 && 
        a.endSpeed >= 85
      );
      
      if (targetAttempt) {
        console.log(`   ✅ НАЙДЕН разгон до ${targetAttempt.endSpeed.toFixed(2)} км/ч!`);
        console.log(`      ⏱️  Время: ${targetAttempt.time.toFixed(2)}с`);
        console.log(`      📏 Дистанция: ${targetAttempt.distance?.toFixed(1) || 'N/A'}м`);
        console.log(`      ⚡ Мощность: ${targetAttempt.peakPower?.toFixed(0) || 'N/A'}W`);
      } else {
        console.log(`   ❌ Разгон до высокой скорости не найден`);
      }
      
      console.log('\n' + '='.repeat(60) + '\n');
      
    } catch (error) {
      console.error(`   ❌ Ошибка: ${error.message}`);
      console.log('\n' + '='.repeat(60) + '\n');
    }
  }
}

finalTest().catch(console.error);
