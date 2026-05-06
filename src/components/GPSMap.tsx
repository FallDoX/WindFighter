import React, { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';

interface GPSMapProps {
  data: Array<{ Latitude?: number | null; Longitude?: number | null; timestamp: number }>;
  currentTime?: number;
  height?: string;
}

// Fix for default marker icons in Leaflet with React
(L.Icon.Default.prototype as any)._getIconUrl && delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapController({ data }: { data: GPSMapProps['data'] }) {
  const map = useMap();

  useEffect(() => {
    if (data.length === 0) return;

    const validPoints = data.filter(p => p.Latitude !== null && p.Latitude !== undefined && p.Longitude !== null && p.Longitude !== undefined);
    if (validPoints.length === 0) return;

    // Fit map to route
    const bounds = L.latLngBounds(
      validPoints.map(p => [p.Latitude!, p.Longitude!] as [number, number])
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [data, map]);

  return null;
}

function CurrentPositionMarker({ data, currentTime }: { data: GPSMapProps['data']; currentTime?: number }) {
  const map = useMap();

  useEffect(() => {
    if (!currentTime || data.length === 0) return;

    // Find closest point to current time
    const closestPoint = data.reduce((prev, curr) => {
      return Math.abs(curr.timestamp - currentTime) < Math.abs(prev.timestamp - currentTime) ? curr : prev;
    });

    if (closestPoint.Latitude !== null && closestPoint.Latitude !== undefined && closestPoint.Longitude !== null && closestPoint.Longitude !== undefined) {
      map.panTo([closestPoint.Latitude!, closestPoint.Longitude!]);
    }
  }, [currentTime, data, map]);

  if (!currentTime || data.length === 0) return null;

  const closestPoint = data.reduce((prev, curr) => {
    return Math.abs(curr.timestamp - currentTime) < Math.abs(prev.timestamp - currentTime) ? curr : prev;
  });

  if (closestPoint.Latitude === null || closestPoint.Latitude === undefined || closestPoint.Longitude === null || closestPoint.Longitude === undefined) return null;

  const customIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="background: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  return <Marker position={[closestPoint.Latitude, closestPoint.Longitude]} icon={customIcon} />;
}

export const GPSMap: React.FC<GPSMapProps> = ({ data, currentTime, height = '400px' }) => {
  const validPoints = data.filter(p => p.Latitude !== null && p.Latitude !== undefined && p.Longitude !== null && p.Longitude !== undefined);

  if (validPoints.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center bg-slate-800/50 rounded-lg border border-slate-700">
        <p className="text-slate-400 text-sm">Нет GPS данных</p>
      </div>
    );
  }

  const routePositions = validPoints.map(p => [p.Latitude!, p.Longitude!] as [number, number]);
  const start = routePositions[0] as [number, number];
  const end = routePositions[routePositions.length - 1] as [number, number];

  const startIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="background: #10b981; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  const endIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="background: #ef4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  return (
    <div style={{ height }} className="rounded-lg overflow-hidden border border-slate-700">
      <MapContainer
        center={[start[0], start[1]]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        className="bg-slate-900"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController data={data} />
        <Polyline
          positions={routePositions}
          color="#3b82f6"
          weight={3}
          opacity={0.8}
        />
        <Marker position={start} icon={startIcon} />
        <Marker position={end} icon={endIcon} />
        <CurrentPositionMarker data={data} currentTime={currentTime} />
      </MapContainer>
    </div>
  );
};
