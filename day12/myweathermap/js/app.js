// ===== 도시 데이터 =====
const KOREA_CITIES = [
  { name: "서울", lat: 37.5665, lon: 126.978 },
  { name: "인천", lat: 37.4563, lon: 126.7052 },
  { name: "춘천", lat: 37.8813, lon: 127.7298 },
  { name: "강릉", lat: 37.7519, lon: 128.8761 },
  { name: "대전", lat: 36.3504, lon: 127.3845 },
  { name: "전주", lat: 35.8242, lon: 127.148 },
  { name: "대구", lat: 35.8714, lon: 128.6014 },
  { name: "광주", lat: 35.1595, lon: 126.8526 },
  { name: "울산", lat: 35.5384, lon: 129.3114 },
  { name: "부산", lat: 35.1796, lon: 129.0756 },
  { name: "목포", lat: 34.8118, lon: 126.3922 },
  { name: "제주", lat: 33.4996, lon: 126.5312 },
].map((city) => ({ ...city, country: "대한민국" }));

const WORLD_CITIES = [
  { name: "서울", country: "대한민국", lat: 37.5665, lon: 126.978 },
  { name: "도쿄", country: "일본", lat: 35.6895, lon: 139.6917 },
  { name: "베이징", country: "중국", lat: 39.9042, lon: 116.4074 },
  { name: "방콕", country: "태국", lat: 13.7563, lon: 100.5018 },
  { name: "싱가포르", country: "싱가포르", lat: 1.3521, lon: 103.8198 },
  { name: "두바이", country: "UAE", lat: 25.2048, lon: 55.2708 },
  { name: "모스크바", country: "러시아", lat: 55.7558, lon: 37.6173 },
  { name: "런던", country: "영국", lat: 51.5074, lon: -0.1278 },
  { name: "파리", country: "프랑스", lat: 48.8566, lon: 2.3522 },
  { name: "카이로", country: "이집트", lat: 30.0444, lon: 31.2357 },
  { name: "뉴욕", country: "미국", lat: 40.7128, lon: -74.006 },
  { name: "LA", country: "미국", lat: 34.0522, lon: -118.2437 },
  { name: "토론토", country: "캐나다", lat: 43.6532, lon: -79.3832 },
  { name: "상파울루", country: "브라질", lat: -23.5505, lon: -46.6333 },
  { name: "시드니", country: "호주", lat: -33.8688, lon: 151.2093 },
  { name: "케이프타운", country: "남아공", lat: -33.9249, lon: 18.4241 },
];

const TABS = {
  kr: { cities: KOREA_CITIES, bounds: [[33.1, 125.8], [38.3, 129.8]], showAllLabels: true },
  world: { cities: WORLD_CITIES, bounds: [[-55, -170], [72, 190]], showAllLabels: false },
};

const API_BASE = "https://api.openweathermap.org/data/2.5";
const CACHE_TTL = 10 * 60 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const WIND_DIRECTIONS = ["북풍 ↓", "북동풍 ↙", "동풍 ←", "남동풍 ↖", "남풍 ↑", "남서풍 ↗", "서풍 →", "북서풍 ↘"];

// ===== 상태 =====
const state = {
  tab: "kr",
  selected: null,
  loading: false,
  emojis: new Map(),
  cache: new Map(),
  markers: new Map(),
  layer: null,
  requestId: 0,
};

let map;

// ===== 지도 =====
function initMap() {
  map = L.map("map", {
    minZoom: 1,
    zoomSnap: 0.25,
    worldCopyJump: true,
  });
  map.fitBounds(TABS.kr.bounds);

  // OSM 기본 타일은 Referer 없는 요청(file://로 열기)을 403으로 막기 때문에 Esri 타일 사용
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 18,
    attribution: "Tiles &copy; Esri",
  }).addTo(map);
}

function createPinIcon(city, isSelected) {
  const showLabel = isSelected || TABS[state.tab].showAllLabels;
  let label = "";

  if (showLabel) {
    let extra = "";
    if (isSelected && state.loading) {
      extra = ' <span class="spinner-border text-primary" role="status"></span>';
    } else if (isSelected && state.emojis.has(cityKey(city))) {
      extra = " " + state.emojis.get(cityKey(city));
    }
    label = `<span class="pin-label">${city.name}${extra}</span>`;
  }

  return L.divIcon({
    className: "",
    html: `<div class="pin-wrap${isSelected ? " selected" : ""}"><div class="pin"><span class="pin-dot"></span></div>${label}</div>`,
    iconSize: [22, 30],
    iconAnchor: [11, 30],
  });
}

function renderPins(cities) {
  if (state.layer) {
    map.removeLayer(state.layer);
  }
  state.markers.clear();
  state.layer = L.layerGroup();

  cities.forEach((city) => {
    const marker = L.marker([city.lat, city.lon], { icon: createPinIcon(city, false) });
    marker.on("click", () => onPinClick(city));
    marker.addTo(state.layer);
    state.markers.set(city.name, marker);
  });

  state.layer.addTo(map);
}

function refreshPins() {
  TABS[state.tab].cities.forEach((city) => {
    const marker = state.markers.get(city.name);
    if (!marker) return;
    const isSelected = state.selected === city;
    marker.setIcon(createPinIcon(city, isSelected));
    marker.setZIndexOffset(isSelected ? 1000 : 0);
  });
}

// ===== API =====
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

function fetchWeather(lat, lon) {
  return fetchJson(`${API_BASE}/weather?lat=${lat}&lon=${lon}&units=metric&lang=kr&appid=${CONFIG.API_KEY}`);
}

function fetchForecast(lat, lon) {
  return fetchJson(`${API_BASE}/forecast?lat=${lat}&lon=${lon}&units=metric&lang=kr&appid=${CONFIG.API_KEY}`);
}

function fetchAirPollution(lat, lon) {
  return fetchJson(`${API_BASE}/air_pollution?lat=${lat}&lon=${lon}&appid=${CONFIG.API_KEY}`);
}

function cityKey(city) {
  return `${city.lat},${city.lon}`;
}

async function getCityData(city) {
  const key = cityKey(city);
  const cached = state.cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  const [current, forecast, air] = await Promise.all([
    fetchWeather(city.lat, city.lon),
    fetchForecast(city.lat, city.lon),
    fetchAirPollution(city.lat, city.lon),
  ]);

  const data = { current, forecast, air };
  state.cache.set(key, { time: Date.now(), data });
  return data;
}

// ===== 가공 =====
function getWeatherEmoji(id, icon) {
  if (id >= 200 && id < 300) return "⛈️";
  if (id >= 300 && id < 400) return "🌦️";
  if (id >= 500 && id < 600) return "🌧️";
  if (id >= 600 && id < 700) return "❄️";
  if (id >= 700 && id < 800) return "🌫️";
  if (id === 800) return icon && icon.endsWith("n") ? "🌙" : "☀️";
  if (id === 801) return "🌤️";
  if (id === 802) return "⛅";
  return "☁️";
}

function getWindDirection(deg) {
  return WIND_DIRECTIONS[Math.round(deg / 45) % 8];
}

function getDustGrade(value, type) {
  const limits = type === "pm10" ? [30, 80, 150] : [15, 35, 75];
  if (value <= limits[0]) return "좋음";
  if (value <= limits[1]) return "보통";
  if (value <= limits[2]) return "나쁨";
  return "매우나쁨";
}

function toLocalDate(dt, timezone) {
  // UTC getter로 읽으면 도시 현지 시각이 된다
  return new Date((dt + timezone) * 1000);
}

function dateKey(date) {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

function formatLocalTime(dt, timezone) {
  const d = toLocalDate(dt, timezone);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]}) ${hh}:${mm}`;
}

function groupForecastByDay(list, timezone, nowDt) {
  const groups = new Map();

  list.forEach((item) => {
    const local = toLocalDate(item.dt, timezone);
    const key = dateKey(local);
    if (!groups.has(key)) {
      groups.set(key, { date: local, items: [] });
    }
    groups.get(key).items.push({ ...item, hour: local.getUTCHours() });
  });

  const days = [...groups.values()].map(({ date, items }) => {
    const max = Math.max(...items.map((i) => i.main.temp_max));
    const min = Math.min(...items.map((i) => i.main.temp_min));
    const noon = items.reduce((best, i) => (Math.abs(i.hour - 12) < Math.abs(best.hour - 12) ? i : best));
    return { key: dateKey(date), weekday: WEEKDAYS[date.getUTCDay()], max, min, weather: noon.weather[0] };
  });

  const todayKey = dateKey(toLocalDate(nowDt, timezone));
  const future = days.filter((d) => d.key !== todayKey);
  if (future.length >= 5) return future.slice(0, 5);
  return days.slice(0, 5);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ===== 렌더링 =====
const $ = (id) => document.getElementById(id);

function setText(id, text) {
  $(id).textContent = text;
}

function renderMainCard(city, current) {
  const weather = current.weather[0];
  const emoji = getWeatherEmoji(weather.id, weather.icon);
  setText("main-name", `${city.name} ${emoji}`);
  setText("main-sub", `${city.country} · ${formatLocalTime(current.dt, current.timezone)}`);
  setText("main-temp", `${Math.round(current.main.temp)}°`);
  setText("main-desc", `${weather.description} · 체감 ${Math.round(current.main.feels_like)}°`);
}

function renderDetailCards(current, air) {
  const { main, wind } = current;
  setText("val-minmax", `${Math.round(main.temp_max)}° / ${Math.round(main.temp_min)}°`);
  setText("val-wind-speed", `${wind.speed.toFixed(1)} m/s`);
  setText("val-wind-dir", getWindDirection(wind.deg));
  setText("sub-wind-dir", `${Math.round(wind.deg)}°`);
  setText("val-humidity", `${main.humidity}%`);

  const { pm10, pm2_5: pm25 } = air.list[0].components;
  setText("val-pm10", `${Math.round(pm10)} ㎍/㎥`);
  setText("sub-pm10", `PM10 · ${getDustGrade(pm10, "pm10")}`);
  setText("val-pm25", `${Math.round(pm25)} ㎍/㎥`);
  setText("sub-pm25", `PM2.5 · ${getDustGrade(pm25, "pm25")}`);
}

function renderForecast(days) {
  $("forecast").innerHTML = days
    .map(
      (day) => `
      <div class="forecast-day">
        <div class="forecast-weekday">${day.weekday}</div>
        <div class="forecast-emoji">${getWeatherEmoji(day.weather.id, day.weather.icon.replace("n", "d"))}</div>
        <div class="forecast-desc">${escapeHtml(day.weather.description)}</div>
        <div class="forecast-temp">
          <span class="max">${Math.round(day.max)}°</span>
          <span class="min">${Math.round(day.min)}°</span>
        </div>
      </div>`
    )
    .join("");
}

const VALUE_IDS = [
  "main-name", "main-sub", "main-temp", "main-desc",
  "val-minmax", "val-wind-speed", "val-wind-dir", "sub-wind-dir",
  "val-humidity", "val-pm10", "sub-pm10", "val-pm25", "sub-pm25",
];

function showLoading() {
  hideError();
  VALUE_IDS.forEach((id) => {
    $(id).innerHTML = '<span class="placeholder-glow"><span class="placeholder col-8"></span></span>';
  });
  $("forecast").innerHTML = Array.from({ length: 5 })
    .map(() => '<div class="forecast-day placeholder-glow"><span class="placeholder col-10" style="height:96px"></span></div>')
    .join("");
}

function showError(message) {
  $("error-message").textContent = message;
  $("error").classList.remove("d-none");
  $("error").classList.add("d-flex");
  VALUE_IDS.forEach((id) => setText(id, "-"));
  $("forecast").innerHTML = "";
}

function hideError() {
  $("error").classList.add("d-none");
  $("error").classList.remove("d-flex");
}

// ===== 이벤트 =====
async function onPinClick(city) {
  const requestId = ++state.requestId;
  state.selected = city;
  state.loading = true;
  refreshPins();
  showLoading();

  try {
    const { current, forecast, air } = await getCityData(city);
    if (requestId !== state.requestId) return;

    const weather = current.weather[0];
    state.emojis.set(cityKey(city), getWeatherEmoji(weather.id, weather.icon));

    renderMainCard(city, current);
    renderDetailCards(current, air);
    renderForecast(groupForecastByDay(forecast.list, forecast.city.timezone, current.dt));
  } catch (error) {
    if (requestId !== state.requestId) return;
    console.error(error);
    showError(
      error.status === 401
        ? "API 키를 확인해 주세요. (js/config.js)"
        : "날씨 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    );
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      refreshPins();
    }
  }
}

function onTabChange(tab) {
  if (tab === state.tab) return;
  state.tab = tab;
  state.selected = null;

  document.querySelectorAll("#tabs .nav-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  const config = TABS[tab];
  renderPins(config.cities);
  map.flyToBounds(config.bounds, { duration: 1 });
  onPinClick(config.cities[0]);
}

function init() {
  initMap();
  renderPins(TABS.kr.cities);
  onPinClick(TABS.kr.cities[0]);

  document.querySelectorAll("#tabs .nav-link").forEach((btn) => {
    btn.addEventListener("click", () => onTabChange(btn.dataset.tab));
  });

  $("retry").addEventListener("click", () => {
    if (state.selected) onPinClick(state.selected);
  });
}

document.addEventListener("DOMContentLoaded", init);
