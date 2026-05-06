const fs = require('fs');

// Отладочная версия для проверки настроек как в приложении
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

  console.log(`🔧 Конфигурация детекции:`);
  console.log(`   minAcceleration: ${cfg.minAcceleration} m/s²`);
  console.log(`   dataGapThreshold: ${cfg.dataGapThreshold}ms`);
  console.log(`   minSpeedChange: ${cfg.minSpeedChange} km/h`);
  console.log(`   minPeakPower: ${cfg.minPeakPower}W`);

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
    console.log(`📍 Диапазон: ${pair.from}-${pair.to} км/ч (${isTraditional ? 'традиционный' : 'roll-on'})`);
  }

  let zeroCount = 0;
  let accelerationCount = 0;

  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];
    
    const timeDiff = (current.timestamp - previous.timestamp) / 1000;
    const currentSpeed = getSpeed(current, 'wheel');
    const previousSpeed = getSpeed(previous, 'wheel');
    const speedDiff = currentSpeed - previousSpeed;
    const acceleration = (speedDiff * 1000 / 3600) / timeDiff;

    // Считаем остановки
    if (currentSpeed < 1) {
      zeroCount++;
    }

    // Считаем ускорения
    if (acceleration >= cfg.minAcceleration && Math.abs(speedDiff) >= cfg.minSpeedChange) {
      accelerationCount++;
    }

    if (timeDiff > cfg.dataGapThreshold / 1000) {
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
            console.log(`🚀 СТАРТ разгона ${pair.from}-${pair.to} км/ч на индексе ${i}`);
            console.log(`   Скорость: ${previousSpeed.toFixed(2)}→${currentSpeed.toFixed(2)} км/ч`);
            console.log(`   Ускорение: ${acceleration.toFixed(3)} m/s²`);
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
            
            console.log(`✅ НАЙДЕНА ПОПЫТКА ${pair.from}-${pair.to} км/ч:`);
            console.log(`   Время: ${time.toFixed(2)}с`);
            console.log(`   Дистанция: ${distance.toFixed(1)}м`);
            console.log(`   Мощность: ${peakPower.toFixed(0)}W`);
            console.log(`   Конечная скорость: ${currentSpeed.toFixed(2)} км/ч`);
            
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

  console.log(`📊 Статистика:`);
  console.log(`   Остановок: ${zeroCount}`);
  console.log(`   Ускорений: ${accelerationCount}`);
  console.log(`   Попыток найдено: ${attempts.length}`);

  return attempts;
}

// Отладка с настройками как в приложении
async function debugApp() {
  console.log('🐛 ОТЛАДКА ПРИЛОЖЕНИЯ\n');

  // Настройки как в приложении после добавления диапазонов
  const thresholdPairs = [
    { from: 0, to: 25 },
    { from: 0, to: 60 }
  ];
  
  const filePath = 'C:\\Users\\admin\\Downloads\\Telegram Desktop\\2026_05_05_21_38_51.csv';

  try {
    console.log(`📁 Анализ файла: ${filePath.split('\\').pop()}`);
    
    const csvText = fs.readFileSync(filePath, 'utf8');
    const data = parseTripData(csvText);
    
    console.log(`📊 Всего записей: ${data.length}`);
    console.log(`⏰ Временной диапазон: ${new Date(data[0].timestamp).toLocaleString()} - ${new Date(data[data.length-1].timestamp).toLocaleString()}`);
    
    // Проверка скорости
    const speeds = data.map(d => d.speed);
    const maxSpeed = Math.max(...speeds);
    const minSpeed = Math.min(...speeds);
    
    console.log(`🚀 Скорость: мин ${minSpeed.toFixed(2)} км/ч, макс ${maxSpeed.toFixed(2)} км/ч`);
    
    // Детекция с отладкой
    console.log('\n🧪 ЗАПУСК ДЕТЕКЦИИ:');
    const attempts = detectAccelerations(data, thresholdPairs);
    
    console.log(`\n📋 РЕЗУЛЬТАТ:`);
    console.log(`🚀 Найдено попыток: ${attempts.length}`);
    
    if (attempts.length > 0) {
      attempts.forEach((attempt, index) => {
        console.log(`\n${index + 1}. ${attempt.thresholdPair.from}-${attempt.thresholdPair.to} км/ч:`);
        console.log(`   ⏱️  ${attempt.time.toFixed(2)}с`);
        console.log(`   📏 ${attempt.distance?.toFixed(1)}м`);
        console.log(`   ⚡ ${attempt.peakPower?.toFixed(0)}W`);
        console.log(`   🏁 ${attempt.endSpeed.toFixed(2)} км/ч`);
        console.log(`   ✅ ${attempt.completed ? 'Завершена' : 'Незавершена'}`);
      });
    } else {
      console.log(`❌ Попытки не найдены!`);
      console.log(`🔍 Возможные причины:`);
      console.log(`   1. Нет остановок (скорость < 1 км/ч)`);
      console.log(`   2. Ускорения слишком слабые (< 0.2 m/s²)`);
      console.log(`   3. Изменения скорости слишком малы (< 1 км/ч)`);
      console.log(`   4. Длительность попыток вне диапазона (2-30с)`);
      console.log(`   5. Мощность слишком низкая (< 300W)`);
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

debugApp().catch(console.error);
