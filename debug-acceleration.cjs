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

function detectAccelerationsDebug(data, thresholdPairs, config = {}) {
  const attempts = [];
  const debugLog = [];
  
  if (data.length === 0 || thresholdPairs.length === 0) {
    return { attempts, debugLog };
  }

  const cfg = {
    minAcceleration: 0.2,
    dataGapThreshold: 500,
    minSpeedChange: 1,
    maxDeceleration: -1.5,
    minAttemptDuration: 2000,
    maxAttemptDuration: 30000,
    minDistance: 5,
    minPeakPower: 300,
    powerConsistencyThreshold: 0.4,
    ...config
  };

  debugLog.push(`🔧 Конфигурация детекции:`);
  debugLog.push(`   minAcceleration: ${cfg.minAcceleration} m/s²`);
  debugLog.push(`   minSpeedChange: ${cfg.minSpeedChange} km/h`);
  debugLog.push(`   minPeakPower: ${cfg.minPeakPower}W`);
  debugLog.push(`   minAttemptDuration: ${cfg.minAttemptDuration}ms`);

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
    debugLog.push(`📍 Настройка диапазона ${pair.from}-${pair.to} км/ч (${isTraditional ? 'традиционный' : 'roll-on'})`);
  }

  debugLog.push(`\n🔍 Анализ ${data.length} записей данных...`);
  
  let zeroSpeedEvents = [];
  let accelerationEvents = [];

  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];
    
    const timeDiff = (current.timestamp - previous.timestamp) / 1000;
    const currentSpeed = getSpeed(current, 'wheel');
    const previousSpeed = getSpeed(previous, 'wheel');
    const speedDiff = currentSpeed - previousSpeed;
    const acceleration = (speedDiff * 1000 / 3600) / timeDiff;

    // Логируем события около нулевой скорости
    if (currentSpeed < 1) {
      zeroSpeedEvents.push({
        index: i,
        time: new Date(current.timestamp).toLocaleString(),
        speed: currentSpeed,
        acceleration: acceleration
      });
    }

    // Логируем сильные ускорения
    if (acceleration >= cfg.minAcceleration && Math.abs(speedDiff) >= cfg.minSpeedChange) {
      accelerationEvents.push({
        index: i,
        time: new Date(current.timestamp).toLocaleString(),
        speed: currentSpeed,
        speedDiff: speedDiff,
        acceleration: acceleration
      });
    }

    if (timeDiff > cfg.dataGapThreshold / 1000) {
      debugLog.push(`⚠️  Разрыв данных ${timeDiff.toFixed(0)}ms на индексе ${i}`);
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
            debugLog.push(`🟢 Обнаружена остановка на индексе ${i}, скорость ${currentSpeed.toFixed(2)} км/ч`);
          } else if (tracking.wasAtZero && 
                     inSpeedRange && 
                     currentSpeed > 1 &&
                     acceleration >= cfg.minAcceleration &&
                     Math.abs(speedDiff) >= cfg.minSpeedChange) {
            shouldStart = true;
            debugLog.push(`🚀 ПОПЫТКА СТАРТА разгона ${pair.from}-${pair.to} км/ч на индексе ${i}`);
            debugLog.push(`   Скорость: ${previousSpeed.toFixed(2)}→${currentSpeed.toFixed(2)} км/ч`);
            debugLog.push(`   Ускорение: ${acceleration.toFixed(3)} m/s² (порог: ${cfg.minAcceleration})`);
            debugLog.push(`   Изменение скорости: ${speedDiff.toFixed(2)} км/ч (порог: ${cfg.minSpeedChange})`);
          }
        } else {
          if (inSpeedRange && 
              acceleration >= cfg.minAcceleration &&
              Math.abs(speedDiff) >= cfg.minSpeedChange) {
            shouldStart = true;
            debugLog.push(`🚀 ПОПЫТКА СТАРТА roll-on ${pair.from}-${pair.to} км/ч на индексе ${i}`);
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
          
          debugLog.push(`🛑 ПОПЫТКА ОКОНЧАНИЯ разгона ${pair.from}-${pair.to} км/ч на индексе ${i}`);
          debugLog.push(`   Длительность: ${duration}ms (порог: ${cfg.minAttemptDuration}-${cfg.maxAttemptDuration})`);
          debugLog.push(`   Конечная скорость: ${currentSpeed.toFixed(2)} км/ч`);
          
          if (duration >= cfg.minAttemptDuration && duration <= cfg.maxAttemptDuration) {
            const attemptData = data.slice(tracking.startIndex, endIndex + 1);
            
            const start = attemptData[0];
            const end = attemptData[attemptData.length - 1];
            const time = duration / 1000;
            const distance = end.totaldistance - start.totaldistance;
            const peakPower = Math.max(...attemptData.map(d => d.power || 0));
            
            debugLog.push(`   ✅ ПОПЫТКА ПРИНЯТА:`);
            debugLog.push(`      Время: ${time.toFixed(2)}с`);
            debugLog.push(`      Дистанция: ${distance.toFixed(1)}м`);
            debugLog.push(`      Мощность: ${peakPower.toFixed(0)}W`);
            
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
          } else {
            debugLog.push(`   ❌ ПОПЫТКА ОТКЛОНЕНА: длительность ${duration}ms вне диапазона`);
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

  return { attempts, debugLog };
}

// Детальный анализ первого файла
async function debugFirstFile() {
  console.log('🔍 ДЕТАЛЬНЫЙ АНАЛИЗ ФАЙЛА 2026_05_05_02_48_55.csv\n');

  try {
    const filePath = 'C:\\Users\\admin\\Downloads\\Telegram Desktop\\2026_05_05_02_48_55.csv';
    const csvText = fs.readFileSync(filePath, 'utf8');
    const data = parseTripData(csvText);
    
    console.log(`📊 Всего записей: ${data.length}`);
    console.log(`⏰ Временной диапазон: ${new Date(data[0].timestamp).toLocaleString()} - ${new Date(data[data.length-1].timestamp).toLocaleString()}`);
    
    // Анализ скорости в районе 02:49:40
    console.log('\n🎯 Анализ района разгона 0-87.08 км/ч (02:49:40):');
    const targetTime = new Date('2026-05-05T02:49:40').getTime();
    const nearbyData = data.filter(entry => 
      Math.abs(entry.timestamp - targetTime) < 10000 // ±10 секунд
    );
    
    console.log(`📝 Найдено ${nearbyData.length} записей в радиусе ±10с от 02:49:40:`);
    nearbyData.forEach(entry => {
      const time = new Date(entry.timestamp).toLocaleString();
      console.log(`   ${time} - скорость: ${entry.speed.toFixed(2)} км/ч, мощность: ${entry.power.toFixed(0)}W`);
    });
    
    // Детекция с отладкой
    const thresholdPairs = [
      { from: 0, to: 25 },
      { from: 0, to: 60 },
      { from: 0, to: 90 },
      { from: 0, to: 100 }
    ];
    
    console.log('\n' + '='.repeat(80));
    console.log('🧪 ЗАПУСК ДЕТЕКТОРА С ОТЛАДКОЙ:');
    console.log('='.repeat(80));
    
    const { attempts, debugLog } = detectAccelerationsDebug(data, thresholdPairs);
    
    console.log('\n📋 ОТЛАДОЧНЫЙ ЛОГ:');
    debugLog.forEach(log => console.log(log));
    
    console.log('\n📊 РЕЗУЛЬТАТ:');
    console.log(`🚀 Найдено попыток: ${attempts.length}`);
    
    if (attempts.length > 0) {
      attempts.forEach((attempt, index) => {
        console.log(`\n${index + 1}. ${attempt.thresholdPair.from}-${attempt.thresholdPair.to} км/ч`);
        console.log(`   ⏱️  Время: ${attempt.time.toFixed(2)}с`);
        console.log(`   📏 Дистанция: ${attempt.distance?.toFixed(1) || 'N/A'}м`);
        console.log(`   ⚡ Мощность: ${attempt.peakPower?.toFixed(0) || 'N/A'}W`);
        console.log(`   🕐 Период: ${new Date(attempt.startTimestamp).toLocaleString()} - ${new Date(attempt.endTimestamp).toLocaleString()}`);
        console.log(`   ✅ Завершена: ${attempt.completed ? 'Да' : 'Нет'}`);
      });
    }
    
    // Проверка на разгон 0-87.08 км/ч
    const targetAttempt = attempts.find(a => 
      Math.abs(a.thresholdPair.from - 0) < 0.1 && 
      a.endSpeed >= 85
    );
    
    if (targetAttempt) {
      console.log(`\n✅ НАЙДЕН разгон до высокой скорости!`);
      console.log(`   Диапазон: ${targetAttempt.thresholdPair.from}-${targetAttempt.thresholdPair.to} км/ч`);
      console.log(`   Конечная скорость: ${targetAttempt.endSpeed.toFixed(2)} км/ч`);
      console.log(`   ⏱️  Время: ${targetAttempt.time.toFixed(2)}с`);
      console.log(`   📏 Дистанция: ${targetAttempt.distance?.toFixed(1) || 'N/A'}м`);
    } else {
      console.log(`\n❌ Разгон до высокой скорости не найден`);
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

// Запуск детального анализа
debugFirstFile().catch(console.error);
