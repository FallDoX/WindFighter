const fs = require('fs');
const path = require('path');

// Fix App.tsx
const appPath = path.join(__dirname, 'src/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// Replace all i18n.t('key') with i18n['key']
appContent = appContent.replace(/i18n\.t\('([^']+)'\)/g, "i18n['$1']");

fs.writeFileSync(appPath, appContent);
console.log('Fixed App.tsx');
