console.log("✅ map.js is loaded and running")

// ================================
// 🌐 后端 API 基础地址（Render）
// ================================
const API_BASE = "https://advanced-web-mapping-citycare.onrender.com";

// ================================
// 🗺️ 初始化地图（默认都柏林）
// ================================
const map = L.map("map").setView([53.3498, -6.2603], 12)

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
}).addTo(map)

let emergencyLayer = L.layerGroup().addTo(map)
let userMarker = null
let userCircle = null

// ================================
// 📍 获取用户当前位置
// ================================
map.whenReady(() => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function (position) {
        const lat = position.coords.latitude
        const lon = position.coords.longitude

        userMarker = L.circleMarker([lat, lon], {
          radius: 8,
          color: "#007bff",
          fillColor: "#007bff",
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindPopup("📍 Your Location")
          .openPopup()

        map.setView([lat, lon], 13)
        window.userLocation = { lat, lon }
        document.getElementById("user-location").textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`
        console.log("✅ User location:", lat, lon)
      },
      function (err) {
        console.warn("⚠️ Failed to get location:", err)
        alert("Unable to access your location. Defaulting to Dublin city center.")
      }
    )
  } else {
    alert("Geolocation is not supported by this browser.")
  }
})

// ================================
// 🚨 加载所有事件 + 自动统计类型
// ================================
async function loadEmergencies () {
  try {
    const res = await fetch(`${API_BASE}/api/emergencies/`)
    const data = await res.json()

    emergencyLayer.clearLayers()

    const geoData = data.type ? data : { type: "FeatureCollection", features: [] }

    // ========================
    // 📊 新增：自动统计 emergency 数量
    // ========================
    const stats = { fire: 0, medical: 0, flood: 0, other: 0 }

    geoData.features.forEach(f => {
      const type = (f.properties.type || "").toLowerCase()
      if (stats[type] !== undefined) stats[type]++
      else stats.other++
    })

    // 更新右侧卡片（需要 HTML 中有这些 ID）
    if (document.getElementById("stat-fire"))
      document.getElementById("stat-fire").textContent = stats.fire
    if (document.getElementById("stat-medical"))
      document.getElementById("stat-medical").textContent = stats.medical
    if (document.getElementById("stat-flood"))
      document.getElementById("stat-flood").textContent = stats.flood
    if (document.getElementById("stat-other"))
      document.getElementById("stat-other").textContent = stats.other

    if (document.getElementById("total-emergencies"))
      document.getElementById("total-emergencies").textContent = geoData.features.length
    // ========================

    // 渲染地图图标
    L.geoJSON(geoData, {
      pointToLayer: (feature, latlng) =>
        L.marker(latlng, {
          icon: L.icon({
            iconUrl: getIconUrl(feature.properties.type),
            iconSize: [28, 28],
          }),
        }).bindPopup(`
          <b>${feature.properties.title}</b><br>
          ${feature.properties.description}<br>
          <i>${feature.properties.type}</i><br>
          ${new Date(feature.properties.reported_at).toLocaleString()}
        `),
    }).addTo(emergencyLayer)

    // 左上角数量
    if (document.getElementById("emergency-count"))
      document.getElementById("emergency-count").textContent = `${geoData.features.length} loaded`

    console.log("✅ Emergencies updated:", geoData.features.length)
  } catch (err) {
    console.error("❌ Failed to load emergencies:", err)
  }
}

function getIconUrl (type) {
  switch (type) {
    case "fire": return "/icons/fire.png"
    case "medical": return "/icons/medical.png"
    case "flood": return "/icons/flood.png"
    default: return "/icons/other.png"
  }
}

loadEmergencies()
setInterval(loadEmergencies, 10000)

// ================================
// 🧭 点击地图上报新事件
// ================================
let tempMarker
map.on("click", function (e) {
  const { lat, lng } = e.latlng
  if (tempMarker) map.removeLayer(tempMarker)
  tempMarker = L.marker([lat, lng]).addTo(map)

  const popup = `
    <form id="reportForm">
      <b>Report Emergency</b><br>
      Title: <input id="title" required /><br>
      Description:<br>
      <textarea id="description" required></textarea><br>
      Type:
      <select id="type">
        <option value="fire">Fire</option>
        <option value="medical">Medical</option>
        <option value="flood">Flood</option>
        <option value="other">Other</option>
      </select><br>
      <button type="submit">Submit</button>
    </form>
  `
  tempMarker.bindPopup(popup).openPopup()

  setTimeout(() => {
    const form = document.getElementById("reportForm")
    if (form) {
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault()
        const title = document.getElementById("title").value
        const description = document.getElementById("description").value
        const type = document.getElementById("type").value

        const res = await fetch(`${API_BASE}/api/emergencies/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            type,
            location: {
              type: "Point",
              coordinates: [lng, lat],
            },
          }),
        })

        if (res.ok) {
          alert("✅ Emergency reported successfully!")
          map.closePopup()
          loadEmergencies()
        } else {
          alert("❌ Failed to report emergency.")
        }
      })
    }
  }, 300)
})

// ================================
// 🎛️ 四个主按钮 + Replay
// ================================
document.addEventListener("DOMContentLoaded", () => {
  const btnNearby = document.getElementById("btnNearby")
  const btnClosest = document.getElementById("btnClosest")
  const btnArea = document.getElementById("btnArea")
  const btnCluster = document.getElementById("btnCluster")
  const btnReplay = document.getElementById("start-replay")

  // Replay
  btnReplay.addEventListener("click", async () => {
    const hours = document.getElementById("replay-hours").value

    const res = await fetch(`${API_BASE}/api/emergencies/replay/?hours=${hours}`)
    const data = await res.json()
    const features = data.features || []

    if (features.length === 0) {
      alert("No emergencies found.")
      return
    }

    replayEmergencies(features)
  })

  // Nearby
  btnNearby.addEventListener("click", async () => {
    if (!window.userLocation) return alert("Please allow location access first.")
    const { lat, lon } = window.userLocation
    const url = `${API_BASE}/api/emergencies/nearby/?lat=${lat}&lng=${lon}&radius=2000`

    if (userCircle) map.removeLayer(userCircle)
    userCircle = L.circle([lat, lon], {
      radius: 2000,
      color: "#007bff",
      fill: false,
    }).addTo(map)

    renderGeoData(url, "green")
  })

  // Closest
  btnClosest.addEventListener("click", async () => {
    if (!window.userLocation) return alert("Please allow location access first.")
    const { lat, lon } = window.userLocation
    const url = `${API_BASE}/api/emergencies/closest/?lat=${lat}&lng=${lon}`
    renderGeoData(url, "red")
  })

  // Within Area
  btnArea.addEventListener("click", async () => {
    const b = map.getBounds()
    const coords = [[
      [b.getWest(), b.getSouth()],
      [b.getEast(), b.getSouth()],
      [b.getEast(), b.getNorth()],
      [b.getWest(), b.getNorth()],
      [b.getWest(), b.getSouth()],
    ]]

    const payload = {
      polygon: { type: "Polygon", coordinates: coords }
    }

    const res = await fetch(`${API_BASE}/api/emergencies/within_area/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    emergencyLayer.clearLayers()
    const features = data.type === "FeatureCollection" ? data.features : data
    features.forEach((f) => {
      const [lng, lat] = f.geometry.coordinates
      L.circleMarker([lat, lng], {
        color: "orange",
        radius: 6,
        fillOpacity: 0.8,
      }).addTo(emergencyLayer)
    })
  })

  // Cluster
  btnCluster.addEventListener("click", async () => {
    const res = await fetch(`${API_BASE}/api/emergencies/cluster_summary/`)
    const data = await res.json()

    emergencyLayer.clearLayers()
    const features = data.type === "FeatureCollection" ? data.features : data

    features.forEach((f) => {
      const [lng, lat] = f.geometry.coordinates
      const count = f.properties?.count || 1
      L.circleMarker([lat, lng], {
        radius: Math.sqrt(count) * 3,
        color: "purple",
        fillColor: "violet",
        fillOpacity: 0.6,
      }).addTo(emergencyLayer)
    })
  })
})

// ================================
// 🔧 通用渲染函数
// ================================
async function renderGeoData (apiUrl, color = "red") {
  try {
    const res = await fetch(apiUrl)
    const data = await res.json()

    emergencyLayer.clearLayers()

    const geoData = data.type ? data : { type: "FeatureCollection", features: [] }

    L.geoJSON(geoData, {
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 6,
          color,
          fillColor: color,
          fillOpacity: 0.8,
        }).bindPopup(
          `<b>${feature.properties.title}</b><br>${feature.properties.description}`
        ),
    }).addTo(emergencyLayer)

    console.log("Rendered:", geoData.features.length)
  } catch (err) {
    console.error("renderGeoData failed:", err)
  }
}

// =====================================================
// 🎬 Replay + Timeline 控制（FPS Engine, 默认 1FPS）
// =====================================================

const timeline = document.getElementById("timeline-container");
const slider = document.getElementById("timeline-slider");
const timeLabel = document.getElementById("timeline-current");
const playBtn = document.getElementById("replay-play");
const pauseBtn = document.getElementById("replay-pause");
const speedSelect = document.getElementById("replay-speed");

let replayPaused = false;
let replayIndex = 0;
let replayEvents = [];
let replaySpeed = 1;

let replayLoop = null;

const BASE_FPS = 1;

// 转换类型 → emoji
function getTypeIcon(type) {
  switch(type) {
    case "fire": return "🔥";
    case "medical": return "🚑";
    case "flood": return "🌊";
    default: return "❓";
  }
}

function showTimeline() { timeline.style.display = "flex"; }
function hideTimeline() { timeline.style.display = "none"; }

function resetTimelineUI() {
  slider.value = 0;
  timeLabel.textContent = "Event 1 / ?";
}

pauseBtn.addEventListener("click", () => replayPaused = true);
playBtn.addEventListener("click", () => replayPaused = false);

speedSelect.addEventListener("change", () => {
  replaySpeed = Number(speedSelect.value);
  startReplayEngine();
});

slider.addEventListener("input", () => {
  if (!replayEvents.length) return;
  replayIndex = Math.floor((slider.value / 100) * (replayEvents.length - 1));
  updateReplayFrame(replayIndex);
});

function updateReplayFrame(i) {
  emergencyLayer.clearLayers();

  for (let k = 0; k <= i; k++) {
    const e = replayEvents[k];
    const [lng, lat] = e.geometry.coordinates;
    const { title, description, type, reported_at } = e.properties;

    L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: getIconUrl(type),
        iconSize: [28, 28],
      })
    })
    .addTo(emergencyLayer)
    .bindPopup(`
      <b>${title}</b><br>
      ${description}<br>
      <i>${type}</i><br>
      ${new Date(reported_at).toLocaleString()}
    `);
  }

  slider.value = (i / (replayEvents.length - 1)) * 100;

  const ev = replayEvents[i];
  timeLabel.textContent =
    `${getTypeIcon(ev.properties.type)} ${ev.properties.type} • Event ${i + 1} / ${replayEvents.length}`;
}

function startReplayEngine() {
  if (replayLoop) clearInterval(replayLoop);

  const fps = BASE_FPS * replaySpeed;
  const interval = 1000 / fps;

  replayLoop = setInterval(() => {
    if (replayPaused) return;

    if (replayIndex >= replayEvents.length) {
      clearInterval(replayLoop);
      hideTimeline();
      return;
    }

    updateReplayFrame(replayIndex);
    replayIndex++;

  }, interval);
}

function replayEmergencies(events) {
  replayEvents = events;
  replayIndex = 0;
  replayPaused = false;

  showTimeline();
  resetTimelineUI();
  emergencyLayer.clearLayers();

  startReplayEngine();
}
