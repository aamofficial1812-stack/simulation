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
    AQX.onSimStart();

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
    AQX.onRainStart();

    tick(null, 0, 7.4, 3200, (v) => {
      state.rainfall = v;
      renderRainfallUI(v);
      AQX.onRainfallTick(v);
    }, () => AQX.onRainStable(state.rainfall));

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
    AQX.onValveOpen();

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
      AQX.onFilterStage("sand");
    }, 1100);

    schedule(() => {
      carbon.classList.remove("is-active");
      carbon.classList.add("is-done");
      flowCarbonUv.style.opacity = 1;
      uv.classList.add("is-active");
      log("Carbon filtration complete — odour & chemical trace removed.");
      AQX.onFilterStage("carbon");
    }, 2300);

    schedule(() => {
      uv.classList.remove("is-active");
      uv.classList.add("is-done");
      flowFilterManifold.style.opacity = 1;
      log("UV sterilization complete — pathogens neutralized.");
      toast("Filtration Completed — water certified for storage.", "ok", "fa-filter-circle-check");
      el("mQuality").textContent = "98%";
      el("barQuality").style.width = "98%";
      AQX.onFilterStage("uv");
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
      AQX.onStorageTick();
    }, () => {
      TANKS.forEach((k) => { state.tanks[k] = targets[k]; });
      renderTanks();
      manifoldFlow.style.opacity = 0;
      log("Storage cycle complete — all tanks updated.");
      AQX.onStorageComplete();
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
      AQX.onCycleComplete();

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

    AQX.onAnalyticsReady(values);
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
    AQX.onSummerMode();

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
    AQX.onLowWaterAlert(best);
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
      AQX.onTransferComplete(source);

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
    AQX.onReset();
  }

  /* ---------------------------------------------------------------------
     EVENTS
  --------------------------------------------------------------------- */
  btnStart.addEventListener("click", startSimulation);
  btnSummer.addEventListener("click", activateSummerMode);
  btnReset.addEventListener("click", resetSystem);
  btnTransfer.addEventListener("click", transferWater);

  /* =======================================================================
     AQUAGRID X — AI PLATFORM EXTENSION
     Everything below is additive: sound engine, IoT sensor simulation,
     the AI Decision Engine feed, the AquaCredit system, and AI City
     Intelligence gauges. It hooks into the sequence above via the AQX.on*
     calls already wired into the core functions, and never mutates the
     original simulation logic.
  ========================================================================= */

  /* ---------------------------------------------------------------------
     SOUND ENGINE  (Web Audio API — no external audio files required)
  --------------------------------------------------------------------- */
  const Sound = (function () {
    let ctx = null, master = null, muted = false;
    const loops = {};

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    function noiseBuffer(duration) {
      const c = ensure();
      if (!c) return null;
      const buffer = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    function tone(freq, duration, type, peak) {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(peak || 0.18, c.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
      osc.connect(g); g.connect(master);
      osc.start();
      osc.stop(c.currentTime + duration + 0.03);
    }

    function click() { tone(720, 0.06, "square", 0.10); }
    function chime() { tone(880, 0.14, "sine", 0.15); setTimeout(() => tone(1320, 0.18, "sine", 0.13), 90); }

    function valveOpen() {
      if (muted) return;
      const c = ensure();
      if (!c) return;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(240, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(90, c.currentTime + 0.35);
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.13, c.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.4);
      osc.connect(g); g.connect(master);
      osc.start(); osc.stop(c.currentTime + 0.42);
    }

    function startLoop(name, filterFreq) {
      if (muted || loops[name]) return;
      const c = ensure();
      if (!c) return;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(2);
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = filterFreq || 1200;
      filter.Q.value = 0.7;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.08, c.currentTime + 0.8);
      src.connect(filter); filter.connect(g); g.connect(master);
      src.start();
      loops[name] = { src, gain: g };
    }

    function stopLoop(name) {
      const L = loops[name];
      if (!L) return;
      const c = ensure();
      try {
        L.gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.6);
        setTimeout(() => { try { L.src.stop(); } catch (e) {} }, 700);
      } catch (e) {}
      delete loops[name];
    }

    function setMuted(v) {
      muted = v;
      const c = ensure();
      if (master && c) master.gain.setTargetAtTime(muted ? 0 : 0.5, c.currentTime, 0.05);
      if (muted) Object.keys(loops).forEach(stopLoop);
    }

    return { click, chime, valveOpen, startLoop, stopLoop, setMuted, ensure };
  })();

  /* ---------------------------------------------------------------------
     AQX — Sensors / AI Decision Engine / AquaCredit / City Intelligence
  --------------------------------------------------------------------- */
  const AQX = (function () {

    let sensorTimer = null;
    let gaugeTimer = null;
    let creditsToday = 0;
    let lifetimeBase = 9420;
    let cityRank = 128;
    let lastBreakdown = null;

    const sens = {
      flow: { inflow: 0, outflow: 0, dist: 0, collected: 0 },
      quality: { ph: 0, tds: 0, turb: 0, temp: 0 },
      pressure: { value: 4.4, leak: false, stability: "Stable" },
      ground: { recharge: 0, level: 12.4, trend: "Stable" },
    };

    /* ---------- helpers ---------- */
    function rand(min, max) { return min + Math.random() * (max - min); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function setLive(cardId, on) {
      const c = el(cardId);
      if (c) c.classList.toggle("is-live", !!on);
    }

    /* ---------- AI feed ---------- */
    function aiSay(text, conf) {
      const feed = el("aiFeed");
      if (!feed) return;
      const div = document.createElement("div");
      div.className = "ai-msg";
      const c = conf || Math.round(rand(90, 99));
      const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
      div.innerHTML =
        '<span class="ai-msg__icon"><i class="fa-solid fa-robot"></i></span>' +
        '<div class="ai-msg__body">' +
        '<div class="ai-msg__text">' + text + '</div>' +
        '<div class="ai-msg__meta"><span>' + time + '</span><span class="ai-msg__conf">Confidence ' + c + '%</span></div>' +
        '</div>';
      feed.prepend(div);
      while (feed.children.length > 25) feed.removeChild(feed.lastChild);
      el("chipAI").textContent = "Analyzing";
    }

    /* ---------- sensor renderers ---------- */
    function renderTankSensors() {
      TANKS.forEach((k) => {
        const pct = Math.round(state.tanks[k]);
        const bar = el("sTankBar" + k);
        const txt = el("sTankTxt" + k);
        if (bar) bar.style.width = pct + "%";
        if (txt) txt.textContent = pct + "%";
      });
      const low = TANKS.filter((k) => state.tanks[k] < 20);
      el("sTankAI").textContent = low.length
        ? "Tank " + low.join(", ") + " below 20% capacity — monitor closely."
        : "All tank levels nominal.";
    }

    function renderFlow() {
      el("sFlowIn").textContent = sens.flow.inflow.toFixed(1) + " L/min";
      el("sFlowOut").textContent = sens.flow.outflow.toFixed(1) + " L/min";
      el("sFlowDist").textContent = Math.round(sens.flow.dist) + "%";
      el("sFlowCollected").textContent = Math.round(sens.flow.collected).toLocaleString("en-IN") + " L";
      el("sFlowAI").textContent = sens.flow.inflow > 1
        ? "Active flow through collection network."
        : "No active flow detected.";
    }

    function renderQuality() {
      el("sPH").textContent = sens.quality.ph ? sens.quality.ph.toFixed(1) : "--";
      el("sTDS").textContent = sens.quality.tds ? sens.quality.tds + " ppm" : "-- ppm";
      el("sTurbidity").textContent = sens.quality.turb ? sens.quality.turb.toFixed(1) + " NTU" : "-- NTU";
      el("sTemp").textContent = sens.quality.temp ? sens.quality.temp + " °C" : "-- °C";
      const good = sens.quality.ph >= 6.5 && sens.quality.ph <= 8.5 && sens.quality.tds > 0 && sens.quality.tds < 300;
      el("sQualityStatus").textContent = sens.quality.ph ? (good ? "Excellent" : "Monitoring") : "Awaiting sample";
    }

    function renderPressure() {
      el("sPressure").textContent = sens.pressure.value.toFixed(1) + " bar";
      el("sStability").textContent = sens.pressure.stability;
      const leakEl = el("sLeak");
      leakEl.textContent = sens.pressure.leak ? "⚠ LEAK DETECTED" : "NORMAL";
      leakEl.classList.toggle("is-alert", sens.pressure.leak);
      leakEl.classList.toggle("is-active", !sens.pressure.leak);
      el("sPressureAI").textContent = sens.pressure.leak
        ? "Anomalous pressure drop detected — dispatching diagnostic."
        : "Pipeline network stable.";
    }

    function renderGroundwater() {
      el("sRecharge").textContent = Math.round(sens.ground.recharge) + "%";
      el("sGWLevel").textContent = sens.ground.level.toFixed(1) + " m";
      el("sGWTrend").innerHTML = '<i class="fa-solid fa-arrow-up"></i> ' + sens.ground.trend;
      el("sGWAI").textContent = sens.ground.recharge > 0
        ? "Recharge in progress — " + Math.round(sens.ground.recharge) + "% of daily target."
        : "Recharge monitoring on standby.";
    }

    /* ---------- background loops ---------- */
    function startSensorLoop() {
      if (sensorTimer) return;
      sensorTimer = setInterval(() => {
        sens.pressure.value = clamp(sens.pressure.value + rand(-0.15, 0.15), 2.6, 5.2);
        sens.pressure.stability = Math.abs(sens.pressure.value - 4.2) < 0.6 ? "Stable" : "Fluctuating";

        if (!sens.pressure.leak && Math.random() < 0.05 && state.running) {
          sens.pressure.leak = true;
          aiSay("⚠ Pressure drop detected in the distribution line — possible leak. Dispatching diagnostic.", Math.round(rand(88, 95)));
          toast("⚠ Leak Detected — pipeline pressure anomaly.", "warn", "fa-triangle-exclamation");
          schedule(() => {
            sens.pressure.leak = false;
            renderPressure();
            aiSay("Leak diagnostic complete — auto-sealing valve engaged, pressure restored.", Math.round(rand(95, 99)));
          }, 5000);
        }
        renderPressure();

        const latEl = el("sESPLatency");
        if (latEl) latEl.textContent = Math.round(rand(12, 34)) + " ms";

        if (sens.ground.recharge > 0) {
          sens.ground.level = clamp(sens.ground.level + rand(0, 0.05), 10, 18);
          renderGroundwater();
        }
      }, 2200);
    }
    function stopSensorLoop() { clearInterval(sensorTimer); sensorTimer = null; }

    /* ---------- AI City Intelligence gauges ---------- */
    const GAUGE_R = 55;
    const GAUGE_LEN = Math.PI * GAUGE_R;

    function buildGauges() {
      document.querySelectorAll(".gauge-card").forEach((card) => {
        const key = card.dataset.gauge;
        const label = card.dataset.label;
        card.innerHTML =
          '<svg viewBox="0 0 140 80">' +
          '<path class="gauge-arc-bg" d="M10,75 A55,55 0 0 1 130,75"/>' +
          '<path class="gauge-arc-fill" id="garc-' + key + '" d="M10,75 A55,55 0 0 1 130,75" ' +
          'stroke="#0ea5e9" stroke-dasharray="' + GAUGE_LEN.toFixed(1) + '" stroke-dashoffset="' + GAUGE_LEN.toFixed(1) + '"/>' +
          '</svg>' +
          '<div class="gauge-value" id="gval-' + key + '">0%</div>' +
          '<div class="gauge-label">' + label + '</div>';
      });
    }

    function updateGauge(key, pct, color) {
      pct = clamp(pct, 0, 100);
      const arc = el("garc-" + key);
      const valEl = el("gval-" + key);
      if (!arc) return;
      const offset = GAUGE_LEN * (1 - pct / 100);
      arc.style.strokeDashoffset = offset.toFixed(1);
      if (color) arc.style.stroke = color;
      if (valEl) valEl.textContent = Math.round(pct) + "%";
    }

    function computeGaugeValues() {
      const avgTank = TANKS.reduce((s, k) => s + state.tanks[k], 0) / TANKS.length;
      const flood = state.rainfall > 0
        ? clamp(100 - avgTank * 0.6 - (7.4 - state.rainfall) * 2, 5, 92)
        : clamp(18 - avgTank * 0.1, 4, 25);
      const demand = state.summer ? rand(70, 85) : rand(35, 55);
      const storageEff = clamp(avgTank + rand(-3, 3), 10, 98);
      const rainPred = state.running && !state.summer ? rand(55, 80) : rand(15, 35);
      const gwPred = clamp(sens.ground.recharge + rand(-5, 10), 5, 96);
      const saving = clamp(avgTank * 0.4 + rand(10, 25), 10, 90);
      return { flood, demand, storageEff, rainPred, gwPred, saving };
    }

    function updateGauges() {
      const v = computeGaugeValues();
      updateGauge("flood", v.flood, v.flood > 60 ? "var(--danger)" : v.flood > 35 ? "var(--warning)" : "var(--success)");
      updateGauge("demand", v.demand, v.demand > 65 ? "var(--warning)" : "var(--sky-500)");
      updateGauge("storageEff", v.storageEff, "var(--success)");
      updateGauge("rainPred", v.rainPred, "var(--sky-500)");
      updateGauge("gwPred", v.gwPred, "var(--success)");
      updateGauge("saving", v.saving, "var(--sky-600)");
      el("chipIntel").textContent = "Live Model";
    }

    function startGaugeLoop() {
      if (gaugeTimer) return;
      updateGauges();
      gaugeTimer = setInterval(updateGauges, 2600);
    }
    function stopGaugeLoop() { clearInterval(gaugeTimer); gaugeTimer = null; }

    /* ---------- AquaCredit wallet & calculation ---------- */
    function updateWallet() {
      el("credToday").textContent = Math.round(creditsToday).toLocaleString("en-IN");
      const lifetime = lifetimeBase + creditsToday;
      el("credLifetime").textContent = Math.round(lifetime).toLocaleString("en-IN");
      const level = lifetime > 12000 ? "PLATINUM" : lifetime > 8000 ? "GOLD" : lifetime > 4000 ? "SILVER" : "BRONZE";
      el("credLevel").textContent = level;
      const progress = clamp((lifetime / 12000) * 100, 0, 100);
      el("credProgressBar").style.width = progress + "%";
      el("credProgressTxt").textContent = Math.round(progress) + "%";
      cityRank = clamp(cityRank - Math.round(creditsToday / 120), 1, 500);
      el("credRank").textContent = "#" + cityRank;
    }

    function resetVerification() {
      document.querySelectorAll("#verifyList li").forEach((li) => li.classList.remove("is-verified"));
    }

    function markVerified(keys) {
      keys.forEach((k, i) => {
        schedule(() => {
          const li = document.querySelector('#verifyList li[data-v="' + k + '"]');
          if (li) li.classList.add("is-verified");
        }, i * 220);
      });
    }

    function computeCredits(values) {
      const harvested = Math.round(clamp(values.numCollected / 60, 150, 420));
      const recharge = Math.round(clamp(values.numRecharge * 3.2, 60, 220));
      const storage = Math.round(clamp(values.numStorage * 1.05, 40, 140));
      const quality = (sens.quality.ph >= 6.5 && sens.quality.ph <= 8.5) ? Math.round(rand(70, 95)) : Math.round(rand(30, 55));
      const leakFree = sens.pressure.leak ? Math.round(rand(20, 45)) : Math.round(rand(75, 98));
      const reuse = Math.round(clamp(values.numDistribution * 1.1, 60, 130));
      const wastage = Math.round(rand(10, 35));
      const total = harvested + recharge + storage + quality + leakFree + reuse - wastage;

      const rows = [
        ["calcHarvest", harvested, "+"],
        ["calcRecharge", recharge, "+"],
        ["calcStorage", storage, "+"],
        ["calcQuality", quality, "+"],
        ["calcLeak", leakFree, "+"],
        ["calcReuse", reuse, "+"],
        ["calcLoss", wastage, "-"],
      ];

      el("creditPanel").hidden = false;

      rows.forEach(([id, target, sign], i) => {
        schedule(() => {
          tick(null, 0, target, 900, (v) => {
            el(id).textContent = (sign === "-" ? "-" : "+") + Math.round(v).toLocaleString("en-IN");
          });
          Sound.click();
        }, i * 300);
      });

      schedule(() => {
        tick(null, 0, total, 1400, (v) => {
          el("calcFinal").textContent = Math.round(v).toLocaleString("en-IN");
        }, () => {
          creditsToday = total;
          updateWallet();
          markVerified(["ai", "credits"]);
          Sound.chime();
          toast(total + " AquaCredits awarded for this cycle.", "ok", "fa-coins");
          aiSay("Cycle analysis complete. " + total + " AquaCredits awarded based on harvesting efficiency and water quality.", Math.round(rand(96, 99)));
        });
      }, rows.length * 300 + 300);

      lastBreakdown = { harvested, recharge, storage, quality, leakFree, reuse, wastage, total, litres: values.numCollected };
    }

    /* ---------- Explain AI Decision modal ---------- */
    function openExplainModal() {
      if (!lastBreakdown) {
        toast("No cycle data yet — run the simulation first.", "warn", "fa-circle-info");
        return;
      }
      const b = lastBreakdown;
      el("modalTotal").textContent = b.total.toLocaleString("en-IN");
      el("modalReasons").innerHTML =
        '<li><i class="fa-solid fa-check"></i> ' + Math.round(b.litres).toLocaleString("en-IN") + ' litres harvested this cycle</li>' +
        '<li><i class="fa-solid fa-check"></i> ' + Math.round(b.recharge * 300).toLocaleString("en-IN") + ' litres groundwater recharge</li>' +
        '<li><i class="fa-solid fa-check"></i> Excellent water quality (pH ' + (sens.quality.ph || 7.2).toFixed(1) + ')</li>' +
        '<li><i class="fa-solid fa-check"></i> ' + Math.min(99, Math.round((b.storage / 140) * 100)) + '% storage efficiency</li>' +
        '<li><i class="fa-solid fa-check"></i> ' + (b.leakFree > 70 ? "No pipeline leakage detected" : "Minor leakage flagged and resolved") + '</li>';
      el("modalConfidence").textContent = Math.round(rand(96, 99)) + "%";
      el("explainModal").hidden = false;
    }
    function closeExplainModal() { el("explainModal").hidden = true; }

    /* ---------- lifecycle hooks (called from the core sequence above) ---------- */
    function onSimStart() {
      el("creditPanel").hidden = true;
      resetVerification();
      Sound.ensure();
      startSensorLoop();
      startGaugeLoop();
      aiSay("Simulation sequence initiated. Cross-checking rainfall probability against live radar feed.");
    }

    function onRainStart() {
      setLive("sensorRain", true);
      const st = el("sRainStatus");
      st.textContent = "ACTIVE"; st.classList.add("is-active");
      Sound.startLoop("rain", 2600);
      aiSay("Rain onset detected. Preparing collection network for automatic activation.", Math.round(rand(93, 98)));
    }

    function onRainfallTick(v) {
      el("sRainVal").textContent = v.toFixed(1) + " mm";
      el("sRainIntensity").textContent = v < 2.5 ? "Light" : v < 6 ? "Moderate" : "Heavy";
    }

    function onRainStable(v) {
      const intensity = v < 2.5 ? "Light" : v < 6 ? "Moderate" : "Heavy";
      el("sRainAI").textContent = intensity + " rainfall detected (" + v.toFixed(1) + " mm). Collection initiated.";
      aiSay("Heavy rainfall confirmed at " + v.toFixed(1) + " mm — opening collection valves across Sector 04.", Math.round(rand(95, 99)));
    }

    function onValveOpen() {
      Sound.valveOpen();
      Sound.startLoop("flow", 900);
      setLive("sensorFlow", true);
      aiSay("Collection valve actuated. Routing surface runoff into filtration bank.", Math.round(rand(94, 98)));
      tick(null, 0, rand(26, 34), 1400, (v) => { sens.flow.inflow = v; renderFlow(); });
    }

    function onFilterStage(stage) {
      if (stage === "sand") aiSay("Sand filtration removing sediment and particulate matter.", Math.round(rand(92, 97)));
      if (stage === "carbon") aiSay("Carbon filtration neutralising odour and chemical trace elements.", Math.round(rand(92, 97)));
      if (stage === "uv") {
        aiSay("UV sterilisation complete. Water certified potable-grade — excellent quality detected.", Math.round(rand(96, 99)));
        setLive("sensorQuality", true);
        const startPh = sens.quality.ph || 6.6;
        tick(null, startPh, 7.2, 900, (v) => { sens.quality.ph = v; renderQuality(); });
        sens.quality.tds = Math.round(rand(120, 160));
        sens.quality.turb = +rand(0.8, 1.6).toFixed(1);
        sens.quality.temp = Math.round(rand(22, 27));
        renderQuality();
        Sound.chime();
      }
    }

    function onStorageTick() {
      renderTankSensors();
      sens.flow.outflow = rand(18, 26);
      sens.flow.dist = Math.round(rand(70, 96));
      sens.flow.collected += rand(80, 140);
      renderFlow();
    }

    function onStorageComplete() {
      aiSay("Storage cycle complete. Redirecting attention to groundwater recharge subsystem.", Math.round(rand(93, 98)));
      setLive("sensorGroundwater", true);
      const startR = sens.ground.recharge;
      tick(null, startR, rand(55, 72), 1800, (v) => { sens.ground.recharge = v; renderGroundwater(); }, () => {
        aiSay("Groundwater recharge complete. No pipeline leakage detected across the network.", Math.round(rand(96, 99)));
        markVerified(["rain", "tank", "quality", "pipeline", "groundwater"]);
      });
    }

    function onCycleComplete() {
      setLive("sensorRain", false);
      setLive("sensorFlow", false);
      Sound.stopLoop("rain");
      Sound.stopLoop("flow");
      const st = el("sRainStatus");
      st.textContent = "IDLE"; st.classList.remove("is-active");
      el("chipSensors").textContent = "7 Sensors Online";
      el("chipAI").textContent = "Standing By";
    }

    function onAnalyticsReady(values) { computeCredits(values); }

    function onSummerMode() {
      sens.ground.trend = "Declining";
      renderGroundwater();
      aiSay("Dry-season pattern confirmed. Recommending reserve reallocation to prevent Tank C depletion.", Math.round(rand(90, 96)));
    }

    function onLowWaterAlert(tankKey) {
      el("sPressureAI").textContent = "Redistribution recommended to stabilise network pressure.";
      aiSay("Tank C approaching critical capacity threshold. Redirecting excess reserve from Tank " + tankKey + ".", Math.round(rand(95, 99)));
    }

    function onTransferComplete(source) {
      aiSay("Transfer from Tank " + source + " complete. Network pressure re-stabilised, no leakage detected.", Math.round(rand(95, 99)));
    }

    function onReset() {
      stopSensorLoop();
      stopGaugeLoop();
      Sound.stopLoop("rain");
      Sound.stopLoop("flow");
      document.querySelectorAll(".sensor-card").forEach((c) => c.classList.remove("is-live"));

      sens.flow = { inflow: 0, outflow: 0, dist: 0, collected: 0 };
      sens.quality = { ph: 0, tds: 0, turb: 0, temp: 0 };
      sens.pressure = { value: 4.4, leak: false, stability: "Stable" };
      sens.ground = { recharge: 0, level: 12.4, trend: "Stable" };
      renderFlow(); renderQuality(); renderPressure(); renderGroundwater(); renderTankSensors();

      el("sRainVal").textContent = "0.0 mm";
      el("sRainIntensity").textContent = "Nil";
      const st = el("sRainStatus");
      st.textContent = "IDLE"; st.classList.remove("is-active");
      el("sRainAI").textContent = "Awaiting precipitation data…";

      el("aiFeed").innerHTML =
        '<div class="ai-msg"><span class="ai-msg__icon"><i class="fa-solid fa-robot"></i></span>' +
        '<div class="ai-msg__body"><div class="ai-msg__text">AI engine reset. Waiting for live sensor telemetry.</div>' +
        '<div class="ai-msg__meta"><span>System</span><span class="ai-msg__conf">Ready</span></div></div></div>';
      el("chipAI").textContent = "Standing By";

      el("creditPanel").hidden = true;
      creditsToday = 0;
      lastBreakdown = null;
      el("credToday").textContent = "0";
      resetVerification();
      updateGauges();
    }

    /* ---------- initial boot ---------- */
    function boot() {
      buildGauges();
      renderFlow(); renderQuality(); renderPressure(); renderGroundwater(); renderTankSensors();
      updateGauges();
      updateWallet();

      const btnMute = el("btnMute");
      let muted = false;
      btnMute.addEventListener("click", () => {
        muted = !muted;
        Sound.setMuted(muted);
        btnMute.innerHTML = muted
          ? '<i class="fa-solid fa-volume-xmark"></i>'
          : '<i class="fa-solid fa-volume-high"></i>';
        toast(muted ? "Sound effects muted." : "Sound effects enabled.", "info", muted ? "fa-volume-xmark" : "fa-volume-high");
      });

      el("btnExplainAI").addEventListener("click", () => { Sound.click(); openExplainModal(); });
      el("modalClose").addEventListener("click", () => { Sound.click(); closeExplainModal(); });
      el("explainModal").addEventListener("click", (e) => { if (e.target.id === "explainModal") closeExplainModal(); });

      document.querySelectorAll(".btn-redeem").forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = btn.closest(".redeem-card");
          const cost = parseInt(card.dataset.cost, 10);
          if (creditsToday < cost) {
            toast("Insufficient AquaCredits for this reward.", "warn", "fa-circle-exclamation");
            return;
          }
          creditsToday -= cost;
          updateWallet();
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Redeemed';
          Sound.chime();
          const title = card.querySelector("h4").textContent;
          toast("Redeemed: " + title, "ok", "fa-gift");
          log("AquaCredit reward redeemed — " + title + " (-" + cost + " credits).");
        });
      });

      [btnStart, btnSummer, btnReset, btnTransfer].forEach((b) => {
        b.addEventListener("click", () => Sound.click());
      });
    }

    return {
      onSimStart, onRainStart, onRainfallTick, onRainStable, onValveOpen,
      onFilterStage, onStorageTick, onStorageComplete, onCycleComplete,
      onAnalyticsReady, onSummerMode, onLowWaterAlert, onTransferComplete,
      onReset, boot,
    };
  })();

  /* ---------------------------------------------------------------------
     INITIAL RENDER
  --------------------------------------------------------------------- */
  renderTanks();
  renderRainfallUI(0);
  cloudsG.classList.add("is-hidden");
  AQX.boot();
})();