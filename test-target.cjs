const fs = require('fs');

// Импортируем функции детекции
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
    
    if (entry.date && entry.time) {
      const dateTimeStr = `${entry.date}T${entry.time}`;
      entry.timestamp = new Date(dateTimeStr).getTime();
    }
    
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
    dataGapThreshold: 2000,
    minSpeedChange: 1,
    maxDeceleration: -1.5,
    minAttemptDuration: 2000,
    maxAttemptDuration: 30000,
    minDistance: 5,
    minPeakPower: 300,
    powerConsistencyThreshold: 0.4,
    ...config
  };

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

  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];
    
    const timeDiff = (current.timestamp - previous.timestamp) / 1000;
    const currentSpeed = getSpeed(current, 'wheel');
    const previousSpeed = getSpeed(previous, 'wheel');
    const speedDiff = currentSpeed - previousSpeed;
    const acceleration = (speedDiff * 1000 / 3600) / timeDiff;

    if (timeDiff > cfg.dataGapThreshold / 1000) {
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

  return attempts;
}

// Целевой тест для поиска разгона 0-87.08 км/ч
async function testTargetAcceleration() {
  console.log('🎯 ЦЕЛЕВОЙ ТЕСТ: Поиск разгона 0-87.08 км/ч\n');

  try {
    const filePath = 'C:\\Users\\admin\\Downloads\\Telegram Desktop\\2026_05_05_02_48_55.csv';
    const csvText = fs.readFileSync(filePath, 'utf8');
    const data = parseTripData(csvText);
    
    console.log(`📊 Всего записей: ${data.length}`);
    
    // Ищем точную область разгона
    const targetTime = new Date('2026-05-05T02:49:40').getTime();
    const targetArea = data.filter(entry => 
      Math.abs(entry.timestamp - targetTime) < 15000 // ±15 секунд
    );
    
    console.log(`📝 Записи в районе 02:49:40 (±15с): ${targetArea.length}`);
    
    // Показываем скорость в этой области
    console.log('\n🚀 Скорость в районе разгона:');
    targetArea.forEach(entry => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      console.log(`   ${time} - ${entry.speed.toFixed(2)} км/ч, мощность: ${entry.power.toFixed(0)}W`);
    });
    
    // Тестируем с диапазоном 0-90 км/ч
    const thresholdPairs = [
      { from: 0, to: 90 }, // Ищем именно 0-90 км/ч
      { from: 0, to: 100 }
    ];
    
    console.log('\n🧪 Тест с диапазонами 0-90 и 0-100 км/ч:');
    
    const attempts = detectAccelerations(data, thresholdPairs);
    
    console.log(`🚀 Найдено попыток: ${attempts.length}`);
    
    attempts.forEach((attempt, index) => {
      const startTime = new Date(attempt.startTimestamp).toLocaleTimeString();
      const endTime = new Date(attempt.endTimestamp).toLocaleTimeString();
      
      console.log(`\n${index + 1}. ${attempt.thresholdPair.from}-${attempt.thresholdPair.to} км/ч:`);
      console.log(`   ⏱️  Время: ${attempt.time.toFixed(2)}с`);
      console.log(`   📏 Дистанция: ${attempt.distance?.toFixed(1) || 'N/A'}м`);
      console.log(`   ⚡ Мощность: ${attempt.peakPower?.toFixed(0) || 'N/A'}W`);
      console.log(`   🕐 Период: ${startTime} - ${endTime}`);
      console.log(`   🏁 Конечная скорость: ${attempt.endSpeed.toFixed(2)} км/ч`);
      console.log(`   ✅ Завершена: ${attempt.completed ? 'Да' : 'Нет'}`);
      
      // Проверяем, это ли наш разгон
      if (attempt.endSpeed >= 85 && attempt.endSpeed <= 90) {
        console.log(`   🎯 ЭТО МОЖЕТ БЫТЬ НАШ РАЗГОН 0-87.08 км/ч!`);
      }
    });
    
    // Если ничего не найдено, пробуем более мягкие условия
    if (attempts.length === 0) {
      console.log('\n🔧 Пробуем более мягкие условия детекции...');
      
      const softConfig = {
        minAcceleration: 0.1, // Еще чувствительнее
        minSpeedChange: 0.5,  // Еще чувствительнее
        minAttemptDuration: 1000, // Минимум 1 секунда
        minPeakPower: 100,      // Минимум 100W
      };
      
      const softAttempts = detectAccelerations(data, thresholdPairs, softConfig);
      
      console.log(`🚀 С мягкими условиями найдено: ${softAttempts.length} попыток`);
      
      softAttempts.forEach((attempt, index) => {
        console.log(`\n${index + 1}. ${attempt.thresholdPair.from}-${attempt.thresholdPair.to} км/ч:`);
        console.log(`   ⏱️  ${attempt.time.toFixed(2)}с, 🏁 ${attempt.endSpeed.toFixed(2)} км/ч`);
        
        if (attempt.endSpeed >= 85 && attempt.endSpeed <= 90) {
          console.log(`   🎯 НАШЕЛ РАЗГОН 0-87.08 км/ч с мягкими условиями!`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

testTargetAcceleration().catch(console.error);
