const STORAGE_KEY = "steak-lobster-reports";
const GEOCODE_CACHE_KEY = "steak-lobster-geocode-cache";
const GOOGLE_API_KEY_STORAGE = "steak-lobster-google-api-key";
const GOOGLE_GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

const form = document.getElementById("reportForm");
const tbody = document.getElementById("reportRows");
const timeframeSelect = document.getElementById("timeframeSelect");
const totalReportsEl = document.getElementById("totalReports");
const activeWindowReportsEl = document.getElementById("activeWindowReports");
const seedDemoButton = document.getElementById("seedDemoData");
const clearDataButton = document.getElementById("clearData");
const servedOnInput = document.getElementById("servedOn");
const googleApiKeyInput = document.getElementById("googleApiKey");
const submitButton = form.querySelector('button[type="submit"]');
servedOnInput.valueAsDate = new Date();

const savedGoogleKey = localStorage.getItem(GOOGLE_API_KEY_STORAGE);
if (savedGoogleKey) {
  googleApiKeyInput.value = savedGoogleKey;
}

googleApiKeyInput.addEventListener("change", () => {
  const cleaned = googleApiKeyInput.value.trim();
  if (cleaned) {
    localStorage.setItem(GOOGLE_API_KEY_STORAGE, cleaned);
  }
});

const map = L.map("map", {
  zoomControl: true,
  scrollWheelZoom: true,
}).setView([39.5, -98.35], 4);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

let heatLayer = L.heatLayer([], {
  radius: 28,
  blur: 22,
  maxZoom: 7,
  minOpacity: 0.35,
  gradient: {
    0.15: "#38bdf8",
    0.4: "#22c55e",
    0.65: "#f59e0b",
    1.0: "#ef4444",
  },
}).addTo(map);

const chartSvg = document.getElementById("reportChart");
const regionLabelLayer = L.layerGroup().addTo(map);

const demoReports = [
  ["Fort Bragg", "United States", 35.1414, -79.007, 4],
  ["Naval Station Norfolk", "United States", 36.9469, -76.3302, 7],
  ["Joint Base Lewis-McChord", "United States", 47.0972, -122.588, 6],
  ["Camp Pendleton", "United States", 33.3043, -117.3064, 5],
  ["Fort Cavazos", "United States", 31.1347, -97.7812, 3],
  ["Joint Base Pearl Harbor-Hickam", "United States", 21.348, -157.941, 4],
];

function loadJson(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : [];
  } catch {
    return [];
  }
}

function loadReports() {
  const parsed = loadJson(STORAGE_KEY);
  return Array.isArray(parsed) ? parsed : [];
}

function saveReports(reports) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

function loadGeocodeCache() {
  const parsed = loadJson(GEOCODE_CACHE_KEY);
  return parsed && !Array.isArray(parsed) ? parsed : {};
}

function saveGeocodeCache(cache) {
  localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
}

function normalizeReport(report) {
  return {
    id: report.id ?? crypto.randomUUID(),
    locationName: String(report.locationName ?? "").trim(),
    country: String(report.country ?? "").trim(),
    latitude: Number(report.latitude),
    longitude: Number(report.longitude),
    servedOn: report.servedOn,
    branch: String(report.branch ?? ""),
    notes: String(report.notes ?? "").trim(),
    createdAt: report.createdAt ?? new Date().toISOString(),
  };
}

function getReports() {
  return loadReports()
    .map(normalizeReport)
    .filter(
      (report) =>
        report.locationName &&
        report.country &&
        Number.isFinite(report.latitude) &&
        Number.isFinite(report.longitude) &&
        report.servedOn,
    )
    .sort((a, b) => new Date(b.servedOn) - new Date(a.servedOn));
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

function filterByTimeframe(reports, timeframeValue) {
  if (timeframeValue === "all") return reports;
  const days = Number(timeframeValue);
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days + 1);
  return reports.filter((report) => new Date(`${report.servedOn}T00:00:00`) >= cutoff);
}

function buildRegionalBuckets(reports) {
  const buckets = new Map();
  reports.forEach((report) => {
    const latBucket = Math.round(report.latitude * 2) / 2;
    const lngBucket = Math.round(report.longitude * 2) / 2;
    const key = `${latBucket},${lngBucket}`;
    const current =
      buckets.get(key) ?? {
        lat: latBucket,
        lng: lngBucket,
        intensity: 0,
        reportCount: 0,
        installations: new Map(),
      };

    current.intensity += 1;
    current.reportCount += 1;
    const installationKey = report.locationName;
    current.installations.set(installationKey, (current.installations.get(installationKey) ?? 0) + 1);
    buckets.set(key, current);
  });

  return Array.from(buckets.values());
}

function aggregateHeatPoints(regionalBuckets) {
  return regionalBuckets.map(({ lat, lng, intensity }) => [lat, lng, Math.min(1, intensity / 6 + 0.15)]);
}

function buildRegionPopup(bucket) {
  const lines = Array.from(bucket.installations.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([installation, count]) => `<li>${escapeHtml(installation)}: ${count}</li>`)
    .join("");

  return `
    <div>
      <strong>Regional reports: ${bucket.reportCount}</strong>
      <ul>${lines}</ul>
    </div>
  `;
}

function renderTable(reports) {
  if (!reports.length) {
    tbody.innerHTML = '<tr><td class="empty-state" colspan="5">No reports yet. Submit the first anonymous dinner report.</td></tr>';
    return;
  }

  tbody.innerHTML = reports
    .slice(0, 12)
    .map(
      (report) => `
        <tr>
          <td>${formatDate(report.servedOn)}</td>
          <td>${escapeHtml(report.locationName)}</td>
          <td>${escapeHtml(report.country)}</td>
          <td>${escapeHtml(report.branch || "Not provided")}</td>
          <td>${escapeHtml(report.notes || "—")}</td>
        </tr>
      `,
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildTimeSeries(reports, timeframeValue) {
  const sorted = [...reports].sort((a, b) => new Date(a.servedOn) - new Date(b.servedOn));
  if (!sorted.length) return [];

  let startDate;
  let endDate = new Date(`${sorted.at(-1).servedOn}T00:00:00`);
  if (timeframeValue === "all") {
    startDate = new Date(`${sorted[0].servedOn}T00:00:00`);
  } else {
    const days = Number(timeframeValue);
    endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);
  }

  const labels = [];
  const counts = new Map();
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const key = cursor.toISOString().slice(0, 10);
    labels.push(key);
    counts.set(key, 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  sorted.forEach((report) => {
    if (counts.has(report.servedOn)) {
      counts.set(report.servedOn, counts.get(report.servedOn) + 1);
    }
  });

  const desiredPoints = 12;
  const bucketSize = Math.max(1, Math.ceil(labels.length / desiredPoints));
  const series = [];

  for (let index = 0; index < labels.length; index += bucketSize) {
    const bucketLabels = labels.slice(index, index + bucketSize);
    const total = bucketLabels.reduce((sum, label) => sum + (counts.get(label) ?? 0), 0);
    series.push({
      label: bucketLabels[0],
      count: total,
    });
  }

  return series;
}

function renderChart(reports, timeframeValue) {
  const series = buildTimeSeries(reports, timeframeValue);
  const width = 820;
  const height = 320;
  const margin = { top: 20, right: 20, bottom: 52, left: 50 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  if (!series.length) {
    chartSvg.innerHTML = `<text x="50%" y="50%" fill="#9bb0c9" text-anchor="middle">No report data in the selected time frame.</text>`;
    return;
  }

  const maxCount = Math.max(...series.map((point) => point.count), 1);
  const xStep = series.length > 1 ? innerWidth / (series.length - 1) : innerWidth / 2;
  const points = series.map((point, index) => {
    const x = margin.left + (series.length > 1 ? index * xStep : innerWidth / 2);
    const y = margin.top + innerHeight - (point.count / maxCount) * innerHeight;
    return { ...point, x, y };
  });

  const yTicks = Array.from({ length: Math.min(5, maxCount + 1) }, (_, index, arr) => {
    const ratio = arr.length === 1 ? 0 : index / (arr.length - 1);
    const value = Math.round(maxCount * (1 - ratio));
    return {
      value,
      y: margin.top + innerHeight * ratio,
    };
  });

  const pathData = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const areaData = `${pathData} L ${points.at(-1).x},${margin.top + innerHeight} L ${points[0].x},${margin.top + innerHeight} Z`;

  chartSvg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" rx="20" fill="rgba(2, 6, 23, 0.35)"></rect>
    ${yTicks
      .map(
        (tick) => `
          <line x1="${margin.left}" y1="${tick.y}" x2="${width - margin.right}" y2="${tick.y}" stroke="rgba(148,163,184,0.18)" stroke-dasharray="4 6"></line>
          <text x="${margin.left - 12}" y="${tick.y + 4}" text-anchor="end" fill="#9bb0c9" font-size="12">${tick.value}</text>
        `,
      )
      .join("")}
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerHeight}" stroke="rgba(229,238,248,0.45)"></line>
    <line x1="${margin.left}" y1="${margin.top + innerHeight}" x2="${width - margin.right}" y2="${margin.top + innerHeight}" stroke="rgba(229,238,248,0.45)"></line>
    <path d="${areaData}" fill="rgba(249,115,22,0.18)"></path>
    <path d="${pathData}" fill="none" stroke="#f97316" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"></path>
    ${points
      .map(
        (point) => `
          <circle cx="${point.x}" cy="${point.y}" r="5" fill="#38bdf8"></circle>
          <text x="${point.x}" y="${height - 18}" text-anchor="middle" fill="#9bb0c9" font-size="11">${formatAxisLabel(point.label)}</text>
        `,
      )
      .join("")}
    <text x="${width / 2}" y="${height - 4}" text-anchor="middle" fill="#e5eef8" font-size="12">Time</text>
    <text x="18" y="${height / 2}" text-anchor="middle" fill="#e5eef8" font-size="12" transform="rotate(-90 18 ${height / 2})">Reports</text>
  `;
}

function formatAxisLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function renderMap(reports) {
  const regionalBuckets = buildRegionalBuckets(reports);
  const points = aggregateHeatPoints(regionalBuckets);
  heatLayer.setLatLngs(points);

  regionLabelLayer.clearLayers();
  regionalBuckets.forEach((bucket) => {
    L.circleMarker([bucket.lat, bucket.lng], {
      radius: 7,
      color: "#38bdf8",
      weight: 1,
      fillColor: "#38bdf8",
      fillOpacity: 0.2,
      opacity: 0.65,
    })
      .bindPopup(buildRegionPopup(bucket))
      .addTo(regionLabelLayer);
  });

  if (points.length) {
    const bounds = L.latLngBounds(points.map(([lat, lng]) => [lat, lng]));
    map.fitBounds(bounds.pad(0.35));
  } else {
    map.setView([39.5, -98.35], 4);
  }
}

function renderDashboard() {
  const allReports = getReports();
  const visibleReports = filterByTimeframe(allReports, timeframeSelect.value);
  totalReportsEl.textContent = String(allReports.length);
  activeWindowReportsEl.textContent = String(visibleReports.length);
  renderMap(visibleReports);
  renderChart(visibleReports, timeframeSelect.value);
  renderTable(allReports);
}

async function geocodeLocation(locationName, country, apiKey) {
  const cacheKey = `${locationName.toLowerCase()}|${country.toLowerCase()}`;
  const cache = loadGeocodeCache();
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const params = new URLSearchParams({
    address: `${locationName}, ${country}`,
    key: apiKey,
  });

  const response = await fetch(`${GOOGLE_GEOCODE_ENDPOINT}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Google geocoding failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== "OK" || !Array.isArray(payload.results) || !payload.results[0]) {
    throw new Error(`Google geocoding status: ${payload.status || "UNKNOWN_ERROR"}`);
  }

  const location = payload.results[0]?.geometry?.location;
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    throw new Error("Google geocoding did not return usable coordinates.");
  }

  const geocoded = {
    latitude: Number(location.lat),
    longitude: Number(location.lng),
  };

  cache[cacheKey] = geocoded;
  saveGeocodeCache(cache);
  return geocoded;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const locationName = String(formData.get("locationName") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const apiKey = String(formData.get("googleApiKey") ?? "").trim();

  if (!apiKey) {
    window.alert("A Google Maps Geocoding API key is required to plot locations.");
    googleApiKeyInput.focus();
    return;
  }

  localStorage.setItem(GOOGLE_API_KEY_STORAGE, apiKey);

  submitButton.disabled = true;
  submitButton.textContent = "Plotting location...";

  try {
    const geocoded = await geocodeLocation(locationName, country, apiKey);
    const report = normalizeReport({
      locationName,
      country,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      servedOn: formData.get("servedOn"),
      branch: formData.get("branch"),
      notes: formData.get("notes"),
    });

    const reports = getReports();
    reports.push(report);
    saveReports(reports);
    form.reset();
    servedOnInput.valueAsDate = new Date();
    googleApiKeyInput.value = apiKey;
    renderDashboard();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Location lookup failed.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Add report";
  }
});

timeframeSelect.addEventListener("change", renderDashboard);

seedDemoButton.addEventListener("click", () => {
  const reports = getReports();
  const seeded = demoReports.flatMap(([locationName, country, latitude, longitude, count], locationIndex) => {
    return Array.from({ length: count }, (_, reportIndex) => {
      const date = new Date();
      date.setDate(date.getDate() - ((locationIndex * 13 + reportIndex * 5) % 120));
      return normalizeReport({
        locationName,
        country,
        latitude: latitude + (reportIndex % 3) * 0.12,
        longitude: longitude - (reportIndex % 2) * 0.12,
        servedOn: date.toISOString().slice(0, 10),
        branch: ["Army", "Navy", "Air Force", "Marine Corps", "Coast Guard"][locationIndex % 5],
        notes: "Demo data for visualization.",
      });
    });
  });

  saveReports([...reports, ...seeded]);
  renderDashboard();
});

clearDataButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(GEOCODE_CACHE_KEY);
  renderDashboard();
});

renderDashboard();
