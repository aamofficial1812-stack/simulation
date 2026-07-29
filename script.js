/* ==========================================================================
   AQUAGRID — Simulation Controller
   Pure vanilla JS. No physics engine — deliberate, readable, timed
   animation states that narrate the real-world process end to end.
   ========================================================================== */

(function () {
  "use strict";

  /* ---------------------------------------------------------------------
     DOM REFERENCES
  --------------------------------------------------------------------- */
  const el = (id) => document.getElementById(id);

  const hdrRainfall = el("hdrRainfall");
  const hdrStatus   = el("hdrStatus");
  const hdrTime     = el("hdrTime");

  const btnStart    = el("btnStart");
  const btnSummer   = el("btnSummer");
  const btnReset    = el("btnReset");
  const btnTransfer = el("btnTransfer");

  const chipRain    = el("chipRain");
  const chipValve   = el("chipValve");

  const cloudsG     = el("clouds");
  const rainGroup   = el("rainGroup");
  const wetRoads    = el("wetRoads");
  const floodMarker = el("floodMarker");

  const valveGroup  = el("valveGroup");
  const valveHandle = el("valveHandle");
  const inletFlow   = el("inletFlow");
  const flowValveFilter = el("flowValveFilter");
  const flowSandCarbon  = el("flowSandCarbon");
  const flowCarbonUv    = el("flowCarbonUv");
  const flowFilterManifold = el("flowFilterManifold");
  const manifoldFlow    = el("manifoldFlow");
  const transferFlow    = el("transferFlow");

  const alertPanel   = el("alertPanel");
  const analyticsPanel = el("analyticsPanel");

  const sysStatusCard  = el("sysStatusCard");
  const sysStatusDot   = sysStatusCard.querySelector(".status-dot-lg");
  const sysStatusValue = el("sysStatusValue");

  const logList = el("logList");

  const TANKS = ["A", "B", "C", "D"];

  /* ---------------------------------------------------------------------
     STATE
  --------------------------------------------------------------------- */
  let state = {
    running: false,
    summer: false,
    rainfall: 0,
    valveOpen: false,
    tanks: { A: 38, B: 55, C: 60, D: 32 },
    timers: [],
  };

  /* ---------------------------------------------------------------------
     UTILITIES
  --------------------------------------------------------------------- */
  function schedule(fn, delay) {
    const t = setTimeout(fn, delay);
    state.timers.push(t);
    return t;
  }

  function clearAllTimers() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
  }

  function tick(now, from, to, duration, onUpdate, onDone) {
    // small numeric tweening helper (used for header rainfall counter etc.)
    const start = performance.now();
    function frame(t) {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      onUpdate(from + (to - from) * eased);
      if (p < 1) {
        requestAnimationFrame(frame);
      } else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  function log(msg) {
    const li = document.createElement("li");
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    li.innerHTML = `<span class="log-time">${time}</span> ${msg}`;
    logList.prepend(li);
    while (logList.children.length > 30) logList.removeChild(logList.lastChild);
  }

  function toast(message, type = "info", icon = "fa-circle-info") {
    const layer = el("toastLayer");
    const div = document.createElement("div");
    div.className = `toast ${type === "warn" ? "toast--warn" : type === "ok" ? "toast--ok" : ""}`;
    div.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
    layer.appendChild(div);
    schedule(() => {
      div.classList.add("is-out");
      schedule(() => div.remove(), 300);
    }, 3800);
  }

  function setSystemStatus(text, mode) {
    sysStatusValue.textContent = text;
    sysStatusDot.classList.remove("is-active", "is-alert");
    if (mode === "active") sysStatusDot.classList.add("is-active");
    if (mode === "alert") sysStatusDot.classList.add("is-alert");
  }

  function setHeaderStatus(text, active) {
    hdrStatus.textContent = text;
    hdrStatus.classList.toggle("is-active", !!active);
  }

  /* ---------------------------------------------------------------------
     CLOCK
  --------------------------------------------------------------------- */
  function updateClock() {
    hdrTime.textContent = new Date().toLocaleTimeString("en-GB", { hour12: false });
  }
  updateClock();
  setInterval(updateClock, 1000);

  /* ---------------------------------------------------------------------
     RAIN RENDERING
  --------------------------------------------------------------------- */
  function buildRainDrops() {
    rainGroup.innerHTML = "";
    const count = 46;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * 800;
      const len = 14 + Math.random() * 12;
      const delay = (Math.random() * 1.4).toFixed(2);
      const dur = (0.7 + Math.random() * 0.5).toFixed(2);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "rain-drop");
      line.setAttribute("x1", x);
      line.setAttribute("y1", 0);
      line.setAttribute("x2", x - 4);
      line.setAttribute("y2", len);
      line.style.animationDuration = dur + "s";
      line.style.animationDelay = delay + "s";
      rainGroup.appendChild(line);
    }
  }

  function buildWindows() {
    const windows = el("windows");
    windows.innerHTML = "";
    const blocks = [
      [240, 10, 60, 110], [320, 30, 50, 90], [400, 15, 70, 105],
      [600, 20, 55, 100], [670, 5, 65, 115],
      [230, 370, 60, 80], [310, 360, 55, 90], [400, 375, 70, 75],
      [610, 365, 60, 85], [690, 350, 70, 100],
    ];
    blocks.forEach(([bx, by, bw, bh]) => {
      for (let y = by + 10; y < by + bh - 8; y += 14) {
        for (let x = bx + 8; x < bx + bw - 6; x += 12) {
          const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          r.setAttribute("x", x);
          r.setAttribute("y", y);
          r.setAttribute("width", 4);
          r.setAttribute("height", 5);
          r.setAttribute("rx", 1);
          windows.appendChild(r);
        }
      }
    });
  }
  buildWindows();

  /* ---------------------------------------------------------------------
     DASHBOARD RENDER
  --------------------------------------------------------------------- */
  function renderTanks() {
    TANKS.forEach((k) => {
      const pct = Math.max(0, Math.min(100, state.tanks[k]));
      const fillEl = document.querySelector(`[data-tank-fill="${k}"]`);
      const pctEl  = document.querySelector(`[data-tank-pct="${k}"]`);
      const tankGroup = document.querySelector(`.tank[data-tank="${k}"]`);
      const h = (pct / 100) * 42;
      fillEl.setAttribute("height", h);
      fillEl.setAttribute("y", 42 - h);
      pctEl.textContent = Math.round(pct) + "%";
      tankGroup.classList.toggle("is-low", pct < 20);

      const barMini = el(`barTank${k}`);
      const txtMini = el(`txtTank${k}`);
      barMini.style.width = pct + "%";
      txtMini.textContent = Math.round(pct) + "%";
    });

    const avg = TANKS.reduce((s, k) => s + state.tanks[k], 0) / TANKS.length;
    el("mCapacity").textContent = Math.round(avg) + "%";
    el("barCapacity").style.width = avg + "%";
  }

  function renderRainfallUI(value) {
    hdrRainfall.innerHTML = value.toFixed(1) + " <small>mm</small>";
    el("mRainfall").textContent = value.toFixed(1) + " mm";
    el("barRainfall").style.width = Math.min(100, (value / 10) * 100) + "%";
  }

  /* ---------------------------------------------------------------------
     MAIN SIMULATION SEQUENCE
  --------------------------------------------------------------------- */
  function startSimulation() {
    if (state.running) return;
    state.running = true;
    btnStart.disabled = true;
    btnSummer.disabled = false;
    alertPanel.hidden = true;
    analyticsPanel.hidden = true;

    setHeaderStatus("Initializing", false);
    setSystemStatus("Rainfall sensor calibrating…", null);
    log("Operator initiated simulation sequence.");

    // STEP 1 — RAINFALL
    schedule(() => stepRainfall(), 400);
  }

  function stepRainfall() {
    chipRain.textContent = "Rain Detected";
    cloudsG.classList.remove("is-hidden");
    buildRainDrops();
    rainGroup.style.opacity = 1;
    wetRoads.style.opacity = 0.55;
    setHeaderStatus("Rainfall Active", true);
    setSystemStatus("Precipitation event in progress…", "active");
    log("Rainfall sensor triggered — precipitation detected over Sector 04.");

    tick(null, 0, 7.4, 3200, (v) => { state.rainfall = v; renderRainfallUI(v); });

    schedule(() => stepAutoCollection(), 3400);
  }

  function stepAutoCollection() {
    log(`Rainfall reading stabilized at ${state.rainfall.toFixed(1)} mm — threshold (5.0 mm) exceeded.`);
    toast("Rainfall exceeds 5.0 mm — auto-collection triggered.", "info", "fa-cloud-rain");

    // Open valve
    state.valveOpen = true;
    valveHandle.classList.add("is-open");
    valveGroup.classList.add("is-open");
    chipValve.textContent = "Valve Open";
    inletFlow.style.opacity = 1;
    flowValveFilter.style.opacity = 1;
    log("Collection valve actuated — status: OPEN.");
    setSystemStatus("Valve open — routing water to filtration bank.", "active");

    schedule(() => stepFiltration(), 1200);
  }

  function stepFiltration() {
    const sand = document.querySelector('.filter-box[data-filter="sand"]');
    const carbon = document.querySelector('.filter-box[data-filter="carbon"]');
    const uv = document.querySelector('.filter-box[data-filter="uv"]');

    log("Filtration sequence started — Sand → Carbon → UV.");
    setSystemStatus("Filtration in progress…", "active");

    sand.classList.add("is-active");
    schedule(() => {
      sand.classList.remove("is-active");
      sand.classList.add("is-done");
      flowSandCarbon.style.opacity = 1;
      carbon.classList.add("is-active");
      log("Sand filtration complete — sediment removed.");
    }, 1100);

    schedule(() => {
      carbon.classList.remove("is-active");
      carbon.classList.add("is-done");
      flowCarbonUv.style.opacity = 1;
      uv.classList.add("is-active");
      log("Carbon filtration complete — odour & chemical trace removed.");
    }, 2300);

    schedule(() => {
      uv.classList.remove("is-active");
      uv.classList.add("is-done");
      flowFilterManifold.style.opacity = 1;
      log("UV sterilization complete — pathogens neutralized.");
      toast("Filtration Completed — water certified for storage.", "ok", "fa-filter-circle-check");
      el("mQuality").textContent = "98%";
      el("barQuality").style.width = "98%";
    }, 3500);

    schedule(() => stepStorage(), 4300);
  }

  function stepStorage() {
    manifoldFlow.style.opacity = 1;
    log("Filtered water routed through underground manifold to storage tanks A–D.");
    setSystemStatus("Filling underground storage tanks…", "active");

    const gains = { A: 24, B: 18, C: 22, D: 28 };
    const targets = {};
    TANKS.forEach((k) => { targets[k] = Math.min(96, state.tanks[k] + gains[k]); });

    const startVals = { ...state.tanks };
    tick(null, 0, 1, 2600, (p) => {
      TANKS.forEach((k) => {
        state.tanks[k] = startVals[k] + (targets[k] - startVals[k]) * p;
      });
      renderTanks();
    }, () => {
      TANKS.forEach((k) => { state.tanks[k] = targets[k]; });
      renderTanks();
      manifoldFlow.style.opacity = 0;
      log("Storage cycle complete — all tanks updated.");
      finishRainCycle();
    });
  }

  function finishRainCycle() {
    // stop rain, dry down
    schedule(() => {
      rainGroup.style.opacity = 0;
      wetRoads.style.opacity = 0;
      chipRain.textContent = "Rain Sensor Idle";
      flowValveFilter.style.opacity = 0;
      flowSandCarbon.style.opacity = 0;
      flowCarbonUv.style.opacity = 0;
      flowFilterManifold.style.opacity = 0;
      inletFlow.style.opacity = 0;
      valveHandle.classList.remove("is-open");
      valveGroup.classList.remove("is-open");
      chipValve.textContent = "Valve Closed";
      state.valveOpen = false;

      setHeaderStatus("Operational", true);
      setSystemStatus("Cycle complete — all systems nominal.", "active");
      el("mDemand").textContent = "Moderate";
      el("barDemand").style.width = "42%";
      el("mOverflow").textContent = "Low";
      el("barOverflow").style.width = "9%";
      log("Rainwater harvesting cycle complete. System nominal.");

      showAnalytics();
      btnStart.disabled = false;
    }, 900);
  }

  function showAnalytics() {
    analyticsPanel.hidden = false;
    const values = {
      numCollected: 18600,
      numFlood: 64,
      numStorage: 91,
      numRecharge: 47,
      numDistribution: 88,
      numEfficiency: 93,
    };
    Object.entries(values).forEach(([id, target]) => {
      tick(null, 0, target, 1400, (v) => {
        el(id).textContent = Math.round(v).toLocaleString("en-IN");
      });
    });
  }

  /* ---------------------------------------------------------------------
     SUMMER MODE
  --------------------------------------------------------------------- */
  function activateSummerMode() {
    if (state.summer) return;
    state.summer = true;
    btnSummer.disabled = true;

    // stop any rain visuals
    rainGroup.style.opacity = 0;
    wetRoads.style.opacity = 0;
    cloudsG.classList.add("is-hidden");
    chipRain.textContent = "Dry Season";
    renderRainfallUI(0);
    state.rainfall = 0;

    setHeaderStatus("Summer Mode", false);
    log("Summer Mode activated — precipitation suspended, evaporation rate increased.");
    toast("Summer Mode engaged — monitoring reserve levels.", "warn", "fa-sun");

    const startC = state.tanks.C;
    tick(null, startC, 15, 2200, (v) => {
      state.tanks.C = v;
      renderTanks();
    }, () => {
      el("mOverflow").textContent = "Low";
      el("barOverflow").style.width = "4%";
      el("mDemand").textContent = "High";
      el("barDemand").style.width = "78%";
      setSystemStatus("Critical: Tank C reserve below threshold.", "alert");
      log("Tank C reserve critical — 15% remaining. Analyzing network for nearest source.");
      analyzeAndRecommend();
    });
  }

  function analyzeAndRecommend() {
    // find the tank (other than C) with the highest level
    let best = null;
    ["A", "B", "D"].forEach((k) => {
      if (!best || state.tanks[k] > state.tanks[best]) best = k;
    });
    const distances = { A: "3.1 km", B: "2.3 km", D: "4.6 km" };

    el("recTank").textContent = "Tank " + best;
    el("recAvail").textContent = Math.round(state.tanks[best]) + "%";
    el("recDist").textContent = distances[best];
    alertPanel.hidden = false;
    alertPanel.dataset.source = best;

    toast(`LOW WATER ALERT — recommended source: Tank ${best}.`, "warn", "fa-triangle-exclamation");
    log(`Network analysis complete — Tank ${best} identified as optimal transfer source.`);
  }

  function transferWater() {
    const source = alertPanel.dataset.source || "B";
    btnTransfer.disabled = true;
    log(`Transfer initiated — Tank ${source} → Tank C.`);
    setSystemStatus(`Transferring water: Tank ${source} → Tank C…`, "active");

    valveHandle.classList.add("is-open");
    valveGroup.classList.add("is-open");
    transferFlow.style.opacity = 1;

    const amount = 30;
    const srcStart = state.tanks[source];
    const cStart = state.tanks.C;
    const srcTarget = Math.max(10, srcStart - amount);
    const cTarget = Math.min(95, cStart + amount);

    tick(null, 0, 1, 2600, (p) => {
      state.tanks[source] = srcStart + (srcTarget - srcStart) * p;
      state.tanks.C = cStart + (cTarget - cStart) * p;
      renderTanks();
      el("recAvail").textContent = Math.round(state.tanks[source]) + "%";
    }, () => {
      transferFlow.style.opacity = 0;
      valveHandle.classList.remove("is-open");
      valveGroup.classList.remove("is-open");
      btnTransfer.disabled = false;
      setSystemStatus("Transfer complete — reserves rebalanced.", "active");
      log(`Transfer complete — Tank C restored to ${Math.round(state.tanks.C)}%.`);
      toast("Water Transfer Completed Successfully", "ok", "fa-circle-check");

      if (state.tanks.C > 25) {
        alertPanel.hidden = true;
      }
    });
  }

  /* ---------------------------------------------------------------------
     RESET
  --------------------------------------------------------------------- */
  function resetSystem() {
    clearAllTimers();
    state = {
      running: false,
      summer: false,
      rainfall: 0,
      valveOpen: false,
      tanks: { A: 38, B: 55, C: 60, D: 32 },
      timers: [],
    };

    btnStart.disabled = false;
    btnSummer.disabled = false;
    btnTransfer.disabled = false;
    alertPanel.hidden = true;
    analyticsPanel.hidden = true;

    cloudsG.classList.remove("is-hidden");
    rainGroup.style.opacity = 0;
    rainGroup.innerHTML = "";
    wetRoads.style.opacity = 0;
    chipRain.textContent = "Rain Sensor Idle";
    floodMarker.style.opacity = 0;

    valveHandle.classList.remove("is-open");
    valveGroup.classList.remove("is-open");
    chipValve.textContent = "Valve Closed";
    inletFlow.style.opacity = 0;
    flowValveFilter.style.opacity = 0;
    flowSandCarbon.style.opacity = 0;
    flowCarbonUv.style.opacity = 0;
    flowFilterManifold.style.opacity = 0;
    manifoldFlow.style.opacity = 0;
    transferFlow.style.opacity = 0;

    document.querySelectorAll(".filter-box").forEach((f) => {
      f.classList.remove("is-active", "is-done");
    });

    renderRainfallUI(0);
    renderTanks();

    el("mQuality").textContent = "--";
    el("barQuality").style.width = "0%";
    el("mDemand").textContent = "Moderate";
    el("barDemand").style.width = "45%";
    el("mOverflow").textContent = "Low";
    el("barOverflow").style.width = "8%";

    setHeaderStatus("Standby", false);
    setSystemStatus("Standby — awaiting simulation start", null);

    logList.innerHTML = `<li><span class="log-time">${new Date().toLocaleTimeString("en-GB",{hour12:false})}</span> System reset. Awaiting operator command.</li>`;
    toast("System reset to standby configuration.", "info", "fa-rotate-left");
  }

  /* ---------------------------------------------------------------------
     EVENTS
  --------------------------------------------------------------------- */
  btnStart.addEventListener("click", startSimulation);
  btnSummer.addEventListener("click", activateSummerMode);
  btnReset.addEventListener("click", resetSystem);
  btnTransfer.addEventListener("click", transferWater);

  /* ---------------------------------------------------------------------
     INITIAL RENDER
  --------------------------------------------------------------------- */
  renderTanks();
  renderRainfallUI(0);
  cloudsG.classList.add("is-hidden");
})();