const fs = require('fs');
const path = require('path');

// Fix TripOverview.tsx
const tripOverviewPath = path.join(__dirname, 'src/components/TripOverview.tsx');
let tripOverviewContent = fs.readFileSync(tripOverviewPath, 'utf8');

// Replace all i18n.t('key') with i18n['key']
tripOverviewContent = tripOverviewContent.replace(/i18n\.t\('([^']+)'\)/g, "i18n['$1']");

fs.writeFileSync(tripOverviewPath, tripOverviewContent);
console.log('Fixed TripOverview.tsx');

// Fix ScatterPlot.tsx
const scatterPlotPath = path.join(__dirname, 'src/components/ScatterPlot.tsx');
let scatterPlotContent = fs.readFileSync(scatterPlotPath, 'utf8');

// Replace all i18n.t('key') with i18n['key']
scatterPlotContent = scatterPlotContent.replace(/i18n\.t\('([^']+)'\)/g, "i18n['$1']");

fs.writeFileSync(scatterPlotPath, scatterPlotContent);
console.log('Fixed ScatterPlot.tsx');
