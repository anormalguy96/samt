/**
 * SƏMT v1.0.0 — Su Əməliyyatlarının Mərkəzləşdirilmiş Təhlili
 * Interactive Prototype Engine (SCADA Operations Console)
 * UNEC System Design PJBL Project — Student: Elmaddin Mohubbatov (Group 550RI-I)
 */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initGisCanvas();
  initMnfChart();
  initWorkOrderLifecycle();
  initAllocationSolver();
  initIpmvpCalculator();
  initLanguageToggle();
  startLiveTelemetryTicker();

  // Milestone 2 Architectural Modules (Lectures 1 to 5)
  initC4Viewer();
  initFsmSimulator();
  initDbcExplorer();
  initHexagonalInspector();
  initTestabilityHarness();
});

// ============================================================================
// 1. Tab Navigation
// ============================================================================
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabViews = document.querySelectorAll('.tab-view');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      tabButtons.forEach(b => b.classList.remove('active'));
      tabViews.forEach(v => v.classList.remove('active'));

      btn.classList.add('active');
      const targetView = document.getElementById(targetId);
      if (targetView) targetView.classList.add('active');
    });
  });

  const viewBalanceBtn = document.getElementById('view-balance-btn');
  if (viewBalanceBtn) {
    viewBalanceBtn.addEventListener('click', () => {
      const balanceTabBtn = document.querySelector('[data-tab="tab-balance"]');
      if (balanceTabBtn) balanceTabBtn.click();
    });
  }
}

// ============================================================================
// 2. GIS Canvas & Interactive Hydraulic Network
// ============================================================================
const dmaNetwork = [
  {
    id: "DMA-YASAMAL-04",
    name: "Yasamal DMA-04 (H. Cavid prospekti)",
    pop: "14,200",
    len: "18.4 km",
    mat: "Asbest-Sement / Polad (1974)",
    soil: "Yüksək Korroziyalı (Abşeron)",
    lof: 8.8,
    cof: 8.9,
    rpn: 78.3,
    status: "CRITICAL_BURST",
    x: 280,
    y: 220,
    radius: 48,
    color: "#ff3b30"
  },
  {
    id: "DMA-SABUNCHU-12",
    name: "Sabunçu DMA-12 (Bakıxanov qəsəbəsi)",
    pop: "22,500",
    len: "26.1 km",
    mat: "Çuqun / Polad (1982)",
    soil: "Orta Şoranlıq",
    lof: 6.4,
    cof: 6.8,
    rpn: 43.5,
    status: "ELEVATED_LOSS",
    x: 520,
    y: 150,
    radius: 56,
    color: "#ffb300"
  },
  {
    id: "DMA-SURAKHANI-08",
    name: "Suraxanı DMA-08 (Hövsan şosesi)",
    pop: "18,900",
    len: "21.3 km",
    mat: "Asbest-Sement (1978)",
    soil: "Yüksək Şoranlıq",
    lof: 7.2,
    cof: 5.8,
    rpn: 41.7,
    status: "ELEVATED_LOSS",
    x: 680,
    y: 290,
    radius: 52,
    color: "#ffb300"
  },
  {
    id: "DMA-KHATAI-02",
    name: "Xətai DMA-02 (Ağ Şəhər zonası)",
    pop: "31,000",
    len: "14.2 km",
    mat: "Müasir HDPE (2018)",
    soil: "Aşağı Korroziyalı",
    lof: 1.5,
    cof: 7.5,
    rpn: 11.2,
    status: "NORMAL",
    x: 440,
    y: 330,
    radius: 46,
    color: "#00e676"
  },
  {
    id: "DMA-NASIMI-07",
    name: "Nəsimi DMA-07 (Tbilisi prospekti)",
    pop: "19,400",
    len: "16.8 km",
    mat: "Duktil Çuqun (1998)",
    soil: "Orta Şoranlıq",
    lof: 3.2,
    cof: 8.5,
    rpn: 27.2,
    status: "NORMAL",
    x: 220,
    y: 120,
    radius: 42,
    color: "#00e676"
  }
];

const pipePipes = [
  { from: 4, to: 0, flow: 45 },
  { from: 0, to: 3, flow: 60 },
  { from: 1, to: 2, flow: 38 },
  { from: 1, to: 3, flow: 52 },
  { from: 4, to: 1, flow: 70 }
];

let particles = [];
let hoveredDma = null;
let selectedDma = dmaNetwork[0];

function initGisCanvas() {
  const canvas = document.getElementById('gis-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Spawn flow animation particles
  for (let i = 0; i < 40; i++) {
    const pipeIdx = Math.floor(Math.random() * pipePipes.length);
    particles.push({
      pipeIdx: pipeIdx,
      progress: Math.random(),
      speed: 0.003 + Math.random() * 0.004
    });
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid lines for sovereign SCADA feel
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw Baku Coastline Contour hint
    ctx.strokeStyle = "rgba(0, 229, 255, 0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(100, 440);
    ctx.bezierCurveTo(300, 410, 480, 450, 620, 390);
    ctx.bezierCurveTo(700, 360, 820, 320, 880, 260);
    ctx.stroke();

    ctx.fillStyle = "rgba(0, 229, 255, 0.2)";
    ctx.font = "11px Outfit, sans-serif";
    ctx.fillText("XƏZƏR DƏNİZİ (CASPIAN SEA)", 660, 440);

    // Draw Pipe Segments
    pipePipes.forEach(p => {
      const fromDma = dmaNetwork[p.from];
      const toDma = dmaNetwork[p.to];

      ctx.beginPath();
      ctx.moveTo(fromDma.x, fromDma.y);
      ctx.lineTo(toDma.x, toDma.y);

      // Color by worst endpoint risk
      const maxRpn = Math.max(fromDma.rpn, toDma.rpn);
      if (maxRpn > 50) {
        ctx.strokeStyle = "rgba(255, 59, 48, 0.6)";
        ctx.lineWidth = 4;
      } else if (maxRpn > 20) {
        ctx.strokeStyle = "rgba(255, 179, 0, 0.45)";
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = "rgba(0, 230, 118, 0.4)";
        ctx.lineWidth = 2.5;
      }
      ctx.stroke();
    });

    // Draw animated flow pulses (particles)
    particles.forEach(pt => {
      pt.progress += pt.speed;
      if (pt.progress > 1) pt.progress = 0;

      const p = pipePipes[pt.pipeIdx];
      const fromDma = dmaNetwork[p.from];
      const toDma = dmaNetwork[p.to];

      const px = fromDma.x + (toDma.x - fromDma.x) * pt.progress;
      const py = fromDma.y + (toDma.y - fromDma.y) * pt.progress;

      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#00e5ff";
      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Draw DMA Zone Polygons / Nodes
    dmaNetwork.forEach(dma => {
      const isSelected = selectedDma && selectedDma.id === dma.id;
      const isHovered = hoveredDma && hoveredDma.id === dma.id;

      // Glow circle
      ctx.beginPath();
      ctx.arc(dma.x, dma.y, dma.radius, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "rgba(0, 229, 255, 0.16)" : "rgba(18, 25, 41, 0.85)";
      ctx.fill();

      ctx.lineWidth = isSelected ? 3 : (isHovered ? 2.5 : 1.5);
      ctx.strokeStyle = dma.color;
      ctx.stroke();

      // Rupture pulse animation if critical
      if (dma.status === "CRITICAL_BURST") {
        const pulseR = dma.radius + (Math.sin(Date.now() / 200) + 1) * 6;
        ctx.beginPath();
        ctx.arc(dma.x, dma.y, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 59, 48, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // DMA Title
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(dma.id, dma.x, dma.y - 4);

      // RPN text
      ctx.fillStyle = dma.color;
      ctx.font = "11px Outfit, sans-serif";
      ctx.fillText(`RPN: ${dma.rpn}`, dma.x, dma.y + 14);
    });

    requestAnimationFrame(render);
  }

  render();

  // Mouse interactivity
  const tooltip = document.getElementById('map-tooltip');

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    hoveredDma = null;
    for (let d of dmaNetwork) {
      const dist = Math.hypot(mx - d.x, my - d.y);
      if (dist < d.radius) {
        hoveredDma = d;
        break;
      }
    }

    if (hoveredDma && tooltip) {
      tooltip.style.display = 'block';
      tooltip.style.left = `${e.clientX - rect.left + 15}px`;
      tooltip.style.top = `${e.clientY - rect.top + 15}px`;
      tooltip.innerHTML = `<strong>${hoveredDma.name}</strong><br>Status: ${hoveredDma.status}<br>RPN: ${hoveredDma.rpn} | Əhali: ${hoveredDma.pop}`;
    } else if (tooltip) {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('click', () => {
    if (hoveredDma) {
      selectedDma = hoveredDma;
      updateSelectedDmaCard(selectedDma);
    }
  });

  // Simulated burst button
  const burstBtn = document.getElementById('simulate-burst-btn');
  if (burstBtn) {
    burstBtn.addEventListener('click', () => {
      selectedDma = dmaNetwork[0]; // Yasamal
      selectedDma.rpn = 94.2;
      selectedDma.status = "CRITICAL_BURST";
      updateSelectedDmaCard(selectedDma);
      triggerKafkaAlert("Yasamal DMA-04", 46.2, 14.5);
      alert("⚠️ SƏMT Xəbərdarlığı: Yasamal DMA-04 zonasında qəfil hidravlik təzyiq zərbəsi (dP/dt = -1.8 bar/s) qeydə alındı! Sərəncam növbəsinə əlavə edildi.");
    });
  }
}

function updateSelectedDmaCard(dma) {
  document.getElementById('info-dma-name').innerText = dma.name;
  document.getElementById('info-dma-pop').innerText = `${dma.pop} nəfər`;
  document.getElementById('info-dma-len').innerText = dma.len;
  document.getElementById('info-dma-mat').innerText = dma.mat;
  document.getElementById('info-dma-rpn-val').innerText = dma.rpn;
  document.getElementById('info-dma-rpn-bar').style.width = `${Math.min(dma.rpn, 100)}%`;
  document.getElementById('active-balance-dma').innerText = dma.name;
  document.getElementById('selected-dma-status').innerText = dma.status;
}

// ============================================================================
// 3. Minimum Night Flow (MNF) Canvas Chart & Rooftop Tank Decomposition
// ============================================================================
function initMnfChart() {
  const canvas = document.getElementById('mnf-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const w = canvas.width;
  const h = canvas.height;

  // Hourly profile data (00:00 to 06:00 AM)
  const hours = ["00:00", "01:00", "02:00", "02:30", "03:00", "03:30", "04:00", "05:00", "06:00"];
  const totalFlow = [62, 54, 46.2, 44.8, 43.1, 44.5, 48.0, 58, 72];
  const legitimate = [18, 14, 11.2, 11.0, 10.8, 11.0, 11.5, 16, 24];
  const tankRefill = [12, 16, 18.5, 17.8, 16.2, 15.0, 12.0, 8, 4];
  const baselineMNF = 12.0; // Baseline target without rupture

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // Night zone highlight (02:00 to 04:00)
    const xStart = (w / 8) * 2;
    const xEnd = (w / 8) * 6;
    ctx.fillStyle = "rgba(0, 229, 255, 0.05)";
    ctx.fillRect(xStart, 30, xEnd - xStart, h - 60);

    ctx.fillStyle = "rgba(0, 229, 255, 0.4)";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillText("MNF PƏNCƏRƏSİ (02:00–04:00 AM)", xStart + 10, 45);

    // Axes & grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let yVal = 20; yVal <= 80; yVal += 20) {
      const yPos = h - 30 - ((yVal / 80) * (h - 60));
      ctx.beginPath();
      ctx.moveTo(40, yPos);
      ctx.lineTo(w - 20, yPos);
      ctx.stroke();

      ctx.fillStyle = "#546279";
      ctx.font = "10px Outfit, sans-serif";
      ctx.fillText(`${yVal} m³/h`, 10, yPos + 3);
    }

    // Baseline target line
    const yBase = h - 30 - ((baselineMNF / 80) * (h - 60));
    ctx.strokeStyle = "rgba(0, 230, 118, 0.6)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(40, yBase);
    ctx.lineTo(w - 20, yBase);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#00e676";
    ctx.fillText("Baza MNF = 12.0 m³/h", w - 130, yBase - 6);

    // Draw Tank Refill Curve (Cyan)
    drawCurve(tankRefill, "#00e5ff", 2);

    // Draw Legitimate Domestic Curve (Indigo)
    drawCurve(legitimate, "#3f51b5", 2);

    // Draw Total Observed Night Flow (Red/Danger)
    drawCurve(totalFlow, "#ff3b30", 3);

    // X Axis Labels
    hours.forEach((hr, i) => {
      const xPos = 40 + (i * ((w - 60) / (hours.length - 1)));
      ctx.fillStyle = "#8e9cb2";
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.fillText(hr, xPos - 12, h - 12);
    });
  }

  function drawCurve(data, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    data.forEach((val, i) => {
      const xPos = 40 + (i * ((w - 60) / (data.length - 1)));
      const yPos = h - 30 - ((val / 80) * (h - 60));
      if (i === 0) ctx.moveTo(xPos, yPos);
      else ctx.lineTo(xPos, yPos);
    });
    ctx.stroke();
  }

  draw();
}

// ============================================================================
// 4. Closed-Loop Work Order Lifecycle
// ============================================================================
const initialAlerts = [
  {
    id: "EVT-BAKU-YAS-094",
    dma: "Yasamal DMA-04",
    flow: 46.2,
    base: 14.5,
    rpn: 78.3,
    time: "03:14 AM"
  },
  {
    id: "EVT-BAKU-SAB-038",
    dma: "Sabunçu DMA-12",
    flow: 38.5,
    base: 18.0,
    rpn: 43.5,
    time: "02:45 AM"
  },
  {
    id: "EVT-BAKU-SUR-012",
    dma: "Suraxanı DMA-08",
    flow: 32.1,
    base: 15.2,
    rpn: 41.7,
    time: "01:20 AM"
  }
];

let workOrderStep = 1; // 1: Detected, 2: Confirmed, 3: Dispatched, 4: Repaired, 5: Verified

function initWorkOrderLifecycle() {
  const alertFeed = document.getElementById('alert-feed');
  if (alertFeed) {
    alertFeed.innerHTML = "";
    initialAlerts.forEach(a => {
      const card = document.createElement('div');
      card.className = "alert-item-card";
      card.innerHTML = `
        <div class="alert-info">
          <div class="alert-info-title">⚠️ ${a.dma} — Gecə Sızması Qeydə Alındı</div>
          <div class="alert-info-desc">Faktiki Axın: <strong>${a.flow} m³/h</strong> (Baza: ${a.base} m³/h) · Vaxt: ${a.time}</div>
        </div>
        <button class="action-btn small-btn primary-btn select-alert-btn" data-id="${a.id}">Tədqiq Et</button>
      `;
      alertFeed.appendChild(card);
    });

    document.querySelectorAll('.select-alert-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        document.getElementById('wo-id-display').innerText = `WO-${id.replace('EVT-', '')}`;
        workOrderStep = 2; // Jump to Confirmed
        updateWorkOrderStepper();
      });
    });
  }

  const advanceBtn = document.getElementById('advance-wo-btn');
  if (advanceBtn) {
    advanceBtn.addEventListener('click', () => {
      if (workOrderStep < 5) {
        workOrderStep++;
        updateWorkOrderStepper();
      } else {
        alert("✅ İş Sərəncamı uğurla VERİFİKASİYA olundu! 14-günlük IPMVP B bazasında qənaət təsdiqləndi.");
      }
    });
  }

  const resetBtn = document.getElementById('reset-wo-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      workOrderStep = 1;
      updateWorkOrderStepper();
    });
  }
}

function updateWorkOrderStepper() {
  const steps = [
    { id: "step-detected", label: "DETECTED" },
    { id: "step-confirmed", label: "CONFIRMED" },
    { id: "step-dispatched", label: "DISPATCHED" },
    { id: "step-repaired", label: "REPAIRED" },
    { id: "step-verified", label: "VERIFIED" }
  ];

  steps.forEach((s, idx) => {
    const el = document.getElementById(s.id);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (idx + 1 === workOrderStep) {
      el.classList.add('active');
    } else if (idx + 1 < workOrderStep) {
      el.classList.add('done');
    }
  });

  const activeLabel = steps[workOrderStep - 1].label;
  const statusBadge = document.getElementById('wo-active-status');
  if (statusBadge) statusBadge.innerText = activeLabel;

  if (workOrderStep === 4) {
    document.getElementById('wo-leak-rate').innerText = "Təmir Tamamlandı (HDPE Qaynaq)";
  } else if (workOrderStep === 5) {
    document.getElementById('wo-leak-rate').innerText = "Qənaət Təsdiqləndi: 24.5 m³/saat (100% bərpa)";
    // Update top KPI
    const savedKpi = document.getElementById('kpi-savings');
    if (savedKpi) savedKpi.innerText = "19,038";
  }
}

function triggerKafkaAlert(dma, flow, base) {
  const alertFeed = document.getElementById('alert-feed');
  if (!alertFeed) return;
  const newCard = document.createElement('div');
  newCard.className = "alert-item-card";
  newCard.innerHTML = `
    <div class="alert-info">
      <div class="alert-info-title">🚨 TƏCİLİ: ${dma} — Boru Partlaması Qeydə Alındı!</div>
      <div class="alert-info-desc">Faktiki Axın: <strong>${flow} m³/h</strong> (Zərbə Qradiyenti: -1.8 bar/s)</div>
    </div>
    <button class="action-btn small-btn primary-btn select-alert-btn">Tədqiq Et</button>
  `;
  alertFeed.prepend(newCard);

  const counter = document.getElementById('alert-counter');
  if (counter) counter.innerText = parseInt(counter.innerText) + 1;
}

// ============================================================================
// 5. Mixed-Integer Linear Programming (MILP) Fair Allocation Engine
// ============================================================================
const agriculturalConsumers = [
  { name: "Sabirabad SİB (Kanal A)", crop: "Pambıq (Cotton, Kc=1.15)", req: 18000, minHuman: 0, critical: true },
  { name: "Saatlı SİB (Kanal B)", crop: "Taxıl (Wheat, Kc=1.05)", req: 14000, minHuman: 0, critical: false },
  { name: "Hacıqabul Bələdiyyəsi", crop: "Təcili İçməli Su (50 L/nəfər)", req: 6000, minHuman: 6000, critical: true },
  { name: "Kürdəmir SİB (Kanal C)", crop: "Nar & Üzüm Bağları (Kc=0.85)", req: 12000, minHuman: 0, critical: false },
  { name: "Zərdab SİB (Kanal D)", crop: "Yoncə / Yem (Kc=0.75)", req: 8000, minHuman: 0, critical: false }
];

function initAllocationSolver() {
  const waterSlider = document.getElementById('alloc-available-water');
  const waterValSpan = document.getElementById('alloc-water-val');
  const droughtSlider = document.getElementById('alloc-drought-factor');
  const droughtLabel = document.getElementById('alloc-drought-label');
  const runBtn = document.getElementById('run-milp-btn');

  if (waterSlider && waterValSpan) {
    waterSlider.addEventListener('input', () => {
      waterValSpan.innerText = Number(waterSlider.value).toLocaleString();
    });
  }

  if (droughtSlider && droughtLabel) {
    droughtSlider.addEventListener('input', () => {
      const val = droughtSlider.value;
      const texts = ["Mülayim (1/5)", "Orta Quraqlıq (2/5)", "Kəskin Quraqlıq (3/5)", "Şiddətli Quraqlıq (4/5)", "Fövqəladə Quraqlıq (5/5)"];
      droughtLabel.innerText = texts[val - 1];
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', runMilpSolver);
  }

  runMilpSolver();
}

function runMilpSolver() {
  const totalWater = parseInt(document.getElementById('alloc-available-water').value) || 50000;
  const droughtLevel = parseInt(document.getElementById('alloc-drought-factor').value) || 4;
  const tbody = document.getElementById('allocation-tbody');
  if (!tbody) return;

  tbody.innerHTML = "";
  let remainingWater = totalWater;

  // 1. Mandatory Municipal Minimum Guarantee (Human Survival Baseline)
  const municipalUser = agriculturalConsumers.find(c => c.minHuman > 0);
  let municipalAlloc = municipalUser ? municipalUser.minHuman : 0;
  remainingWater -= municipalAlloc;

  // 2. Proportionally allocate remaining based on crop urgency Kc and drought weight
  const totalWeight = agriculturalConsumers.filter(c => c.minHuman === 0).reduce((sum, c) => {
    const weight = c.critical ? (1.5 * droughtLevel) : 1.0;
    return sum + (c.req * weight);
  }, 0);

  agriculturalConsumers.forEach(consumer => {
    let allocated = 0;
    let reasonCode = "";

    if (consumer.minHuman > 0) {
      allocated = consumer.minHuman;
      reasonCode = "ALLOC_MINIMUM_SURVIVAL_MUNICIPAL";
    } else {
      const weight = consumer.critical ? (1.5 * droughtLevel) : 1.0;
      const share = (consumer.req * weight) / totalWeight;
      allocated = Math.min(consumer.req, Math.round(remainingWater * share));
      
      if (allocated >= consumer.req * 0.95) {
        reasonCode = "ALLOC_PRIORITY_CROP_CRITICAL";
      } else if (allocated >= consumer.req * 0.5) {
        reasonCode = "ALLOC_RATIONED_DROUGHT_INDEX";
      } else {
        reasonCode = "ALLOC_DEFERRED_EXCESS_QUOTA";
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${consumer.name}</strong></td>
      <td>${consumer.crop}</td>
      <td class="mono">${consumer.req.toLocaleString()} m³</td>
      <td class="mono font-bold accent-text">${allocated.toLocaleString()} m³</td>
      <td><span class="reason-tag">${reasonCode}</span></td>
      <td><span class="status-pill success-pill">Təsdiqləndi</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================================
// 6. IPMVP Option B Verified Water Savings Calculator
// ============================================================================
function initIpmvpCalculator() {
  const inputs = ['calc-q-base', 'calc-q-post', 'calc-p-base', 'calc-p-post', 'calc-alpha'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', recalculateIpmvp);
  });

  recalculateIpmvp();
}

function recalculateIpmvp() {
  const qBase = parseFloat(document.getElementById('calc-q-base').value) || 50.0;
  const qPost = parseFloat(document.getElementById('calc-q-post').value) || 22.0;
  const pBase = parseFloat(document.getElementById('calc-p-base').value) || 3.5;
  const pPost = parseFloat(document.getElementById('calc-p-post').value) || 3.6;
  const alpha = parseFloat(document.getElementById('calc-alpha').value) || 0.5;

  // Formula: Volume Saved = (Q_base - Q_post) * (P_post / P_base)^alpha * 24
  const deltaQ = Math.max(0, qBase - qPost);
  const pressureFactor = Math.pow(pPost / pBase, alpha);
  const dailySavedM3 = deltaQ * pressureFactor * 24;
  const tariffAznPerM3 = 0.40; // Official industrial/loss baseline tariff
  const dailySavingsAzn = dailySavedM3 * tariffAznPerM3;
  const annualSavingsAzn = dailySavingsAzn * 365;

  const resM3 = document.getElementById('calc-result-m3');
  const resAzn = document.getElementById('calc-result-azn');

  if (resM3) resM3.innerText = `${dailySavedM3.toFixed(1)} m³ / gün`;
  if (resAzn) resAzn.innerText = `Gündəlik İqtisadi Səmərə: ${dailySavingsAzn.toFixed(2)} AZN (İllik: ~${Math.round(annualSavingsAzn).toLocaleString()} AZN)`;
}

// ============================================================================
// 7. Language Switcher (Azerbaijani Primary / English Secondary)
// ============================================================================
let currentLang = 'az';

const translations = {
  az: {
    "kpi-inflow-title": "ÜMUMİ ŞƏBƏKƏ DAXİLOLMA",
    "kpi-inflow-sub": "Ceyranbatan + Şəmkir + Taxtakörpü",
    "kpi-nrw-title": "FİZİKİ İTKİ DƏRƏCƏSİ (NRW)",
    "kpi-nrw-sub": "15-dəqiqəlik hidravlik kütlə balansı",
    "kpi-anomalies-title": "AKTİV SIZMA ANOMALİYALARI",
    "kpi-anomalies-sub": "Təzyiq dalğası + Gecə axını (MNF)",
    "kpi-saved-title": "TƏSDİQLƏNMİŞ QƏNAƏT (IPMVP B)",
    "kpi-saved-sub": "İqtisadi effekt: 7,380 AZN/gün",
    "tab-gis": "GIS Şəbəkəsi & DMA Xəritəsi",
    "tab-balance": "DMA Balansı & Gecə Axını (MNF)",
    "tab-workorders": "Qəza Siqnalları & İş Sərəncamları",
    "tab-allocation": "Ədalətli Bölgü Modeli (MILP)",
    "tab-opendata": "opendata.az & IPMVP B Audit",
    "gis-title": "Böyük Bakı və Abşeron DMA Hidravlik Topologiyası",
    "dma-details-title": "Seçilmiş DMA Zonası Məlumatları"
  },
  en: {
    "kpi-inflow-title": "TOTAL NETWORK INFLOW",
    "kpi-inflow-sub": "Jeyranbatan + Shamkir + Takhtakorpu",
    "kpi-nrw-title": "PHYSICAL LOSS RATE (NRW)",
    "kpi-nrw-sub": "15-minute hydraulic mass balance",
    "kpi-anomalies-title": "ACTIVE LEAK ANOMALIES",
    "kpi-anomalies-sub": "Pressure transient + Minimum night flow",
    "kpi-saved-title": "VERIFIED SAVINGS (IPMVP B)",
    "kpi-saved-sub": "Economic payback: 7,380 AZN/day",
    "tab-gis": "GIS Network & DMA Map",
    "tab-balance": "DMA Balance & Night Flow (MNF)",
    "tab-workorders": "Leak Alerts & Work Orders",
    "tab-allocation": "Fair Allocation Solver (MILP)",
    "tab-opendata": "opendata.az & IPMVP B Audit",
    "gis-title": "Greater Baku & Absheron Hydraulic Topology",
    "dma-details-title": "Selected DMA Information"
  }
};

function initLanguageToggle() {
  const langBtn = document.getElementById('lang-btn');
  if (!langBtn) return;

  langBtn.addEventListener('click', () => {
    currentLang = currentLang === 'az' ? 'en' : 'az';
    langBtn.innerText = currentLang === 'az' ? 'AZ | EN' : 'EN | AZ';

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[currentLang][key]) {
        el.innerText = translations[currentLang][key];
      }
    });
  });
}

// ============================================================================
// 8. Live Telemetry Ticker (Pulsing simulated sensor ticks)
// ============================================================================
function startLiveTelemetryTicker() {
  setInterval(() => {
    const ingress = document.getElementById('hdr-ingress');
    const latency = document.getElementById('hdr-latency');
    if (ingress) {
      const jitter = (Math.random() * 4 - 2).toFixed(1);
      ingress.innerText = (302.7 + parseFloat(jitter)).toFixed(1);
    }
    if (latency) {
      const lJitter = (Math.random() * 0.1 - 0.05).toFixed(2);
      latency.innerText = (1.18 + parseFloat(lJitter)).toFixed(2);
    }
  }, 2500);
}


// ============================================================================
// 9. C4 Architecture Viewer (Lecture 2: Design Abstractions)
// ============================================================================
const c4Models = {
  l1: {
    title: "Level 1: System Context Diagram (SƏMT National Ecosystem)",
    cards: [
      { name: "SƏMT Operational Platform", tech: "Core Distributed System", desc: "Monitors 150 pilot DMAs, computes hydraulic mass balances, localizes leaks, and schedules fair water delivery on Hökumət Buludu." },
      { name: "Field Telemetry Edge Nodes", tech: "Ultrasonic / Pressure IoT", desc: "Transmits flow and high-frequency pressure readings over cellular private APN using Mutual TLS 1.3." },
      { name: "ADSEA Dispatchers & Engineers", tech: "Internal Users", desc: "Monitors real-time national water balance, reviews burst alarms, and authorizes maintenance dispatch." },
      { name: "Water User Associations (WUAs)", tech: "Agricultural Stakeholders", desc: "Submits regional irrigation requests and receives auditable canal allocation schedules." },
      { name: "Citizen Portal (mygov)", tech: "External Government System", desc: "Receives automated water outage notifications for public subscriber push alerts." },
      { name: "Open Data Portal (opendata.az)", tech: "External State Datasets", desc: "Provides macro statistical series for national water balance cross-calibration." }
    ]
  },
  l2: {
    title: "Level 2: Container Diagram (Hökumət Buludu / 4-Zone Sovereign Cloud)",
    cards: [
      { name: "Ingestion Gateway Container", tech: "Rust / Axum · Zone 2 DMZ", desc: "Terminates mTLS 1.3, authenticates device X.509 certs, deserializes Protobuf v3 payloads, and publishes to Kafka." },
      { name: "Message Broker Container", tech: "Apache Kafka · Zone 3 Core", desc: "Decouples ingress from processing; partitions raw streams by dma_id with consistent hashing (40,300 pkts/s burst capability)." },
      { name: "Stream Analytics Container", tech: "Apache Flink · Zone 3 Core", desc: "Computes 15-min tumbling mass balances and sliding 02:00-04:00 AM Minimum Night Flow (MNF) 5th percentile baselines." },
      { name: "Unified Storage Container", tech: "PostgreSQL 16 + TimescaleDB + PostGIS", desc: "Houses 3NF spatial network topology tables alongside time-partitioned hypertables with real-time continuous aggregates." },
      { name: "Allocation Solver Container", tech: "Python / Google OR-Tools", desc: "Executes Mixed-Integer Linear Programming (MILP) fair allocation optimization, generating auditable reason codes." },
      { name: "Operations Web Console", tech: "React / TypeScript · Zone 4", desc: "Delivers control room situational awareness, interactive GIS topology, and work order tracking." },
      { name: "Field Crew Offline PWA", tech: "TypeScript / RxDB PWA", desc: "Equips mobile repair crews with offline form completion, GPS check-in, and geotagged repair photo caching." }
    ]
  },
  l3: {
    title: "Level 3: Component Diagram (Core DMA Water Balance Service)",
    cards: [
      { name: "WindowedFlowAggregator", tech: "Flink Stream Operator", desc: "Maintains 15-minute tumbling windows calculating net delta volume (Inflow - Outflow - Authorized Consumption)." },
      { name: "NightBaselineFilter", tech: "Domain Service Component", desc: "Extracts 02:00-04:00 AM flow data, subtracts rooftop tank float-valve refills, and calculates 5th percentile minimum night flow." },
      { name: "BurstTransientDetector", tech: "DSP Analysis Component", desc: "Monitors 50 Hz acoustic pressure waves for rapid negative pressure wavefronts indicating pipe rupture." },
      { name: "WorkOrderDispatcher", tech: "Application Service", desc: "Generates prioritized repair work orders, assigns repair crews, and logs incidents to append-only audit tables." }
    ]
  }
};

function initC4Viewer() {
  const displayBox = document.getElementById('c4-display-box');
  const buttons = document.querySelectorAll('.c4-btn');
  if (!displayBox || !buttons.length) return;

  function renderC4(levelKey) {
    const data = c4Models[levelKey];
    let html = `<div style="margin-bottom: 12px; font-size: 13px; font-weight: 700; color: var(--cyan-primary);">${data.title}</div><div class="c4-grid-cards">`;
    data.cards.forEach(c => {
      html += `
        <div class="c4-card">
          <div class="c4-card-title">📦 ${c.name}</div>
          <div class="c4-card-tech">${c.tech}</div>
          <div class="c4-card-desc">${c.desc}</div>
        </div>
      `;
    });
    html += `</div>`;
    displayBox.innerHTML = html;
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderC4(btn.getAttribute('data-c4'));
    });
  });

  renderC4('l1');
}

// ============================================================================
// 10. Finite State Machine (Lecture 2: Leak Lifecycle Simulator)
// ============================================================================
const fsmStates = [
  {
    key: "detected",
    name: "DETECTED",
    text: "Vəziyyət: DETECTED. Flink axın mühərriki 15-dəqiqəlik gecə axınında 3-siqma kənarlaşma qeydə alıb. Qəza dərəcəsi prioritetləşdirilib (RPN: 78.3).",
    guard: "🔒 Keçid Şərti (Guard): Növbəti mərhələyə keçmək üçün təmir qrupu seçilməli və GPS ünvanı təsdiq edilməlidir."
  },
  {
    key: "assigned",
    name: "ASSIGNED",
    text: "Vəziyyət: ASSIGNED. Qrup #3 (Mərkəzi Qəza Xidməti) təyin olundu. Sahə işçilərinin mobil PWA cihazına push bildiriş göndərildi.",
    guard: "🔒 Keçid Şərti (Guard): Qrup hadisə yerinə çatmalı və mobil PWA ilə GPS check-in icra etməlidir."
  },
  {
    key: "repaired",
    name: "REPAIRED",
    text: "Vəziyyət: REPAIRED. Qrup qəzanı aradan qaldırdı: 100mm asbest-sement boruya polad klamura quraşdırıldı. Foto-sübut MinIO S3-ə yükləndi.",
    guard: "🔒 Keçid Şərti (Guard): Yalnız gecə 02:00-04:00 AM IPMVP Option B hidravlik gecə axını təsdiqindən sonra VERIFIED statusuna keçə bilər."
  },
  {
    key: "verified",
    name: "VERIFIED",
    text: "Vəziyyət: VERIFIED (TƏSDİQLƏNDİ). Gecə axını 46.2 m³/h-dən 22.0 m³/h-ə düşdü. Təzyiq-normallaşdırılmış qənaət: 664.8 m³/gün. Qəza bağlandı!",
    guard: "✔ Hadisə Dövrü Tamamlandı: Dövlət SU Reyestrinə daimi audit qeydi yazıldı."
  }
];

let currentFsmIdx = 0;

function initFsmSimulator() {
  const stepBtn = document.getElementById('fsm-step-btn');
  const resetBtn = document.getElementById('fsm-reset-btn');
  const conditionText = document.getElementById('fsm-condition-text');
  const guardText = document.getElementById('fsm-guard-text');

  function updateFsmUI() {
    fsmStates.forEach((st, idx) => {
      const node = document.getElementById(`fsm-node-${st.key}`);
      if (node) {
        if (idx === currentFsmIdx) node.classList.add('active');
        else node.classList.remove('active');
      }
    });

    const curr = fsmStates[currentFsmIdx];
    if (conditionText) conditionText.innerHTML = `<strong>Vəziyyət: ${curr.name}.</strong> ${curr.text}`;
    if (guardText) guardText.innerHTML = curr.guard;
  }

  if (stepBtn) {
    stepBtn.addEventListener('click', () => {
      currentFsmIdx = (currentFsmIdx + 1) % fsmStates.length;
      updateFsmUI();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      currentFsmIdx = 0;
      updateFsmUI();
    });
  }

  updateFsmUI();
}

// ============================================================================
// 11. Design by Contract (DbC) Explorer (Lecture 3: Interface Specifications)
// ============================================================================
function initDbcExplorer() {
  const driftInput = document.getElementById('dbc-drift-input');
  const driftVal = document.getElementById('dbc-drift-val');
  const batteryInput = document.getElementById('dbc-battery-input');
  const batteryVal = document.getElementById('dbc-battery-val');
  const mtlsSelect = document.getElementById('dbc-mtls-select');
  const execBtn = document.getElementById('dbc-execute-btn');
  const terminal = document.getElementById('dbc-terminal');

  if (driftInput && driftVal) {
    driftInput.addEventListener('input', () => {
      const v = driftInput.value;
      driftVal.textContent = (v >= 0 ? `+${v}` : v);
    });
  }

  if (batteryInput && batteryVal) {
    batteryInput.addEventListener('input', () => {
      batteryVal.textContent = batteryInput.value;
    });
  }

  if (execBtn && terminal) {
    execBtn.addEventListener('click', () => {
      const drift = parseInt(driftInput.value, 10);
      const battery = parseFloat(batteryInput.value);
      const mtls = mtlsSelect.value;

      terminal.innerHTML = '';
      function addLine(txt, type) {
        const div = document.createElement('div');
        div.className = `term-line ${type}`;
        div.textContent = txt;
        terminal.appendChild(div);
      }

      addLine(`[HTTP] POST https://api.semt.gov.az/v1/telemetry/batch`, 'info');
      addLine(`[HEADERS] Host: api.semt.gov.az | Content-Type: application/json | X-Correlation-ID: cor-20261020-001`, 'info');
      addLine(`[BODY] { gateway_id: "GW-BAKU-YAS-008", clock_drift: ${drift}m, battery: ${battery}V, cert: "${mtls}" }`, 'info');
      addLine(`--- MÜQAVİLƏ ŞƏRTLƏRİNİN (PRECONDITIONS) YOXLANIŞI ---`, 'warn');

      // Check mTLS
      if (mtls !== 'valid') {
        addLine(`❌ PRECONDITION POZULDU: mTLS Sertifikatı Etibarsızdır (${mtls.toUpperCase()})`, 'error');
        addLine(`[HTTP CAVAB] 401 Unauthorized — Client certificate verification failed. (Müqavilə ləğv edildi, icra dayandırıldı)`, 'error');
        return;
      }
      addLine(`✔ Precondition 1 Keçdi: mTLS X.509 Müştəri Sertifikatı Doğrulandı (ADSEA Root CA).`, 'success');

      // Check Clock Drift
      if (Math.abs(drift) > 15) {
        addLine(`❌ PRECONDITION POZULDU: Saat sürüşməsi 15 dəqiqədən çoxdur (|${drift}| > 15m). Replay attack təhlükəsi!`, 'error');
        addLine(`[HTTP CAVAB] 400 Bad Request — Error Code: ERR_CLOCK_DRIFT_EXCEEDED (Müqavilə pozuntusu, paket qəbul edilmədi)`, 'error');
        return;
      }
      addLine(`✔ Precondition 2 Keçdi: Saat sürüşməsi qəbulediləndir (${drift} dəqiqə <= 15m).`, 'success');

      // Check Battery
      if (battery < 3.0) {
        addLine(`❌ PRECONDITION POZULDU: Batareya gərginliyi kritik dərəcədə aşağıdır (${battery}V < 3.0V). Ölçmə etibarsız sayıla bilər.`, 'error');
        addLine(`[HTTP CAVAB] 400 Bad Request — Error Code: ERR_BATTERY_LOW_FAULT`, 'error');
        return;
      }
      addLine(`✔ Precondition 3 Keçdi: Batareya gərginliyi normaldır (${battery}V >= 3.0V).`, 'success');

      // All preconditions satisfied!
      addLine(`--- BÜTÜN PRECONDITIONS TƏMİN EDİLDİ ➔ XİDMƏT İCRA OLUNUR ---`, 'success');
      addLine(`✔ POSTCONDITION ZƏMANƏTİ (ENSURES):`, 'success');
      addLine(`  1. Paket təhlükəsiz deserializasiya olundu (<120 bayt Protobuf formatında).`, 'success');
      addLine(`  2. 'telemetry.raw' Kafka mövzusuna dma_id='DMA-YASAMAL-04' açarı ilə yazıldı.`, 'success');
      addLine(`  3. İcraçıya deterministik qəbz qaytarıldı: ACK_SEQ=987102, status='ACCEPTED'.`, 'success');
      addLine(`[HTTP CAVAB] 202 Accepted — { status: "ACCEPTED", ingested_count: 16, correlation_id: "cor-20261020-001" }`, 'success');
    });
  }
}

// ============================================================================
// 12. Hexagonal Architecture Inspector (Lecture 4: Design for Change)
// ============================================================================
function initHexagonalInspector() {
  const swapBtn = document.getElementById('swap-adapter-btn');
  const chipDb = document.getElementById('chip-db');

  let isStub = false;
  if (swapBtn && chipDb) {
    swapBtn.addEventListener('click', () => {
      isStub = !isStub;
      if (isStub) {
        chipDb.textContent = "In-Memory Test Repository (Stub)";
        chipDb.style.borderColor = "var(--cyan-primary)";
        chipDb.style.color = "var(--cyan-primary)";
        swapBtn.textContent = "🔄 Verilənlər Bazasını Dəyiş: [In-Memory Stub ➔ TimescaleDB / PostGIS]";
        alert("Asılılıqların İnversiyası (DIP): Verilənlər bazası adapteri dəyişdirildi! Nüvə Domain Məntiqi və Kütlə Balansı alqoritmi 100% toxunulmaz qaldı.");
      } else {
        chipDb.textContent = "TimescaleDB / PostGIS Adapter";
        chipDb.style.borderColor = "var(--emerald-accent)";
        chipDb.style.color = "var(--emerald-accent)";
        swapBtn.textContent = "🔄 Verilənlər Bazasını Dəyiş: [TimescaleDB ➔ In-Memory Test Stub]";
      }
    });
  }
}

// ============================================================================
// 13. Testability Harness & Time-Travel Clock Seam (Lecture 5)
// ============================================================================
let simulatedHour = 14;
let isSimulatedClock = false;

function initTestabilityHarness() {
  const radioReal = document.getElementById('radio-real-clock');
  const radioSim = document.getElementById('radio-sim-clock');
  const timeBox = document.getElementById('time-travel-box');
  const timeSlider = document.getElementById('time-slider');
  const timeText = document.getElementById('sim-time-text');
  const jumpMnfBtn = document.getElementById('jump-mnf-btn');
  const jumpDayBtn = document.getElementById('jump-day-btn');
  const hdrClockDisplay = document.getElementById('header-clock-display');
  const hdrClockMode = document.getElementById('header-clock-mode');

  function updateClockDisplay() {
    if (!hdrClockDisplay) return;
    if (isSimulatedClock) {
      const hh = String(simulatedHour).padStart(2, '0');
      hdrClockDisplay.textContent = `SIM ${hh}:15:00`;
      if (hdrClockMode) {
        hdrClockMode.textContent = "SEAM (SIM)";
        hdrClockMode.className = "clock-mode-badge simulated";
      }
    } else {
      const now = new Date();
      hdrClockDisplay.textContent = `UTC ${now.toTimeString().split(' ')[0]}`;
      if (hdrClockMode) {
        hdrClockMode.textContent = "REAL";
        hdrClockMode.className = "clock-mode-badge";
      }
    }
  }

  if (radioReal && radioSim) {
    radioReal.addEventListener('change', () => {
      isSimulatedClock = false;
      if (timeBox) {
        timeBox.style.opacity = '0.5';
        timeBox.style.pointerEvents = 'none';
      }
      updateClockDisplay();
    });

    radioSim.addEventListener('change', () => {
      isSimulatedClock = true;
      if (timeBox) {
        timeBox.style.opacity = '1';
        timeBox.style.pointerEvents = 'auto';
      }
      updateClockDisplay();
    });
  }

  function setSimHour(h) {
    simulatedHour = h;
    if (timeSlider) timeSlider.value = h;
    if (timeText) {
      if (h >= 2 && h <= 4) {
        timeText.innerHTML = `${String(h).padStart(2, '0')}:00 <strong>(Gecə MNF Sızma Analiz Pəncərəsi!)</strong>`;
      } else {
        timeText.innerHTML = `${String(h).padStart(2, '0')}:00 (Gündüz İstehlakı)`;
      }
    }
    updateClockDisplay();
    // Trigger balance UI update
    const balanceTime = document.getElementById('balance-calc-time');
    if (balanceTime) balanceTime.textContent = `20 Oktyabr 2026, ${String(h).padStart(2, '0')}:15`;
  }

  if (timeSlider) {
    timeSlider.addEventListener('input', () => {
      setSimHour(parseInt(timeSlider.value, 10));
    });
  }

  if (jumpMnfBtn) {
    jumpMnfBtn.addEventListener('click', () => {
      if (radioSim) radioSim.checked = true;
      isSimulatedClock = true;
      if (timeBox) {
        timeBox.style.opacity = '1';
        timeBox.style.pointerEvents = 'auto';
      }
      setSimHour(3);
      alert("Zaman İdarəetməsi (Lecture 5): Sistem saatı 03:00 AM-ə kökləndi! Minimum Night Flow (MNF) alqoritmi gecə rejimini işə saldı.");
    });
  }

  if (jumpDayBtn) {
    jumpDayBtn.addEventListener('click', () => {
      setSimHour(14);
    });
  }

  // Synthetic Bursts & Injections
  const injectBurstBtn = document.getElementById('inject-burst-btn');
  const injectTankBtn = document.getElementById('inject-tank-btn');
  const injectTransientBtn = document.getElementById('inject-transient-btn');
  const logBox = document.getElementById('injection-log-box');

  function addInjectLog(msg, type) {
    if (!logBox) return;
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logBox.prepend(div);
  }

  if (injectBurstBtn) {
    injectBurstBtn.addEventListener('click', () => {
      addInjectLog("⚡ INJECT: Torricelli Qəfil Boru Qəzası yaradıldı! (Cd=0.62, Area=20cm², Q=25.4 m³/h). Flink ΔQ > 3.8σ qeydə aldı!", "alert");
      const kpiAnomalies = document.getElementById('kpi-anomalies');
      if (kpiAnomalies) kpiAnomalies.textContent = "4";
      const valLoss = document.getElementById('val-loss');
      if (valLoss) valLoss.textContent = "58.4 m³/saat (56.8%)";
      const barLoss = document.getElementById('bar-loss-fill');
      if (barLoss) barLoss.style.width = "57%";
    });
  }

  if (injectTankBtn) {
    injectTankBtn.addEventListener('click', () => {
      addInjectLog("🌊 INJECT: 450 binada su çənlərinin float-valve dolması simulyasiya edildi (+18.5 m³/h). TankFilter alqoritmi bunu sızmadan uğurla ayırdı (Yalançı Həyəcan Süzüldü).", "warn");
    });
  }

  if (injectTransientBtn) {
    injectTransientBtn.addEventListener('click', () => {
      addInjectLog("📈 INJECT: 50 Hz yüksək tezlikli təzyiq zərbəsi (Water Hammer transient) yaradıldı! PostGIS ST_DWithin ən yaxın 3 təcrid klapanını tapdı.", "info");
    });
  }
}
