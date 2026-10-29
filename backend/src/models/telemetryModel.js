/**
 * Transit Corridor Geometry & Telemetry State Model.
 * Represents the 15 physical bus stops along the Ahmedabad-Gandhinagar corridor.
 */

const CORRIDOR_STOPS = [
  { id: 0, name: 'ISCON', distanceMeters: 0, lat: 23.0281, lon: 72.5074 },
  { id: 1, name: 'Pakwaan', distanceMeters: 1257, lat: 23.0387, lon: 72.5118 },
  { id: 2, name: 'GuruDwara', distanceMeters: 2200, lat: 23.0460, lon: 72.5153 },
  { id: 3, name: 'Thaltej', distanceMeters: 2787, lat: 23.0499, lon: 72.5170 },
  { id: 4, name: 'Zydus', distanceMeters: 3839, lat: 23.0586, lon: 72.5198 },
  { id: 5, name: 'Kargil', distanceMeters: 5977, lat: 23.0767, lon: 72.5252 },
  { id: 6, name: 'Sola', distanceMeters: 7080, lat: 23.0850, lon: 72.5280 },
  { id: 7, name: 'Gota', distanceMeters: 8537, lat: 23.0980, lon: 72.5320 },
  { id: 8, name: 'Vaishnodevi', distanceMeters: 12956, lat: 23.1364, lon: 72.5429 },
  { id: 9, name: 'Khoraj', distanceMeters: 16114, lat: 23.1550, lon: 72.5650 },
  { id: 10, name: 'Adalaj-Uvarsad', distanceMeters: 19710, lat: 23.1700, lon: 72.5850 },
  { id: 11, name: 'Sargasan', distanceMeters: 23404, lat: 23.1929, lon: 72.6147 },
  { id: 12, name: 'Raksha-shakti', distanceMeters: 26298, lat: 23.1859, lon: 72.6376 },
  { id: 13, name: 'Bhaijipura', distanceMeters: 29191, lat: 23.1650, lon: 72.6500 },
  { id: 14, name: 'PDPU', distanceMeters: 32508, lat: 23.1548, lon: 72.6683 },
];

let latestTelemetry = null;
const recentHistory = [];

function getCorridor() {
  return {
    corridorName: 'ISCON-PDPU Transit Corridor',
    totalStops: CORRIDOR_STOPS.length,
    totalDistanceKm: 32.51,
    stops: CORRIDOR_STOPS,
  };
}

function updateLatest(telemetry) {
  latestTelemetry = telemetry;
  recentHistory.unshift(telemetry);
  if (recentHistory.length > 50) {
    recentHistory.pop();
  }
}

function getLatest() {
  return latestTelemetry;
}

function getRecentHistory() {
  return recentHistory;
}

module.exports = {
  getCorridor,
  updateLatest,
  getLatest,
  getRecentHistory,
};

