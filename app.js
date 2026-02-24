const LEGACY_STORAGE_KEY = "shadowboard-state-v1";
const ENCRYPTED_STORAGE_KEY = "shadowboard-encrypted-v1";
const KDF_ITERATIONS = 210000;
const AUTO_LOCK_MS = 10 * 60 * 1000;
const LEVERAGE_TYPES = ["Skill", "Network", "Capital", "Distribution", "Technology"];
const MISSION_STATUS = ["Planning", "Active", "Completed", "Abandoned"];
const THEME_KEY = "shadowboard-theme-v1";

let state = freshState();
let bootState = freshState();
let isUnlocked = false;
let sessionPassphrase = "";
let autoLockTimer = null;
let activeView = "dashboard";
let selectedMissionId = null;
let undoStack = [];
let redoStack = [];
let lastSnapshot = JSON.stringify(state);
let searchTerm = "";
let tagFilter = "";
let showArchived = false;

const missionForm = document.getElementById("mission-form");
const missionTitleInput = document.getElementById("mission-title");
const missionHorizonInput = document.getElementById("mission-horizon");
const missionsList = document.getElementById("missions-list");
const missionTemplate = document.getElementById("mission-template");
const missionSearchInput = document.getElementById("mission-search");
const tagFilterInput = document.getElementById("tag-filter");
const showArchivedInput = document.getElementById("show-archived");
const undoBtn = document.getElementById("undo-btn");
const redoBtn = document.getElementById("redo-btn");

const riskForm = document.getElementById("risk-form");
const riskTitleInput = document.getElementById("risk-title");
const riskProbInput = document.getElementById("risk-prob");
const riskImpactInput = document.getElementById("risk-impact");
const avgExposureEl = document.getElementById("avg-exposure");
const peakExposureEl = document.getElementById("peak-exposure");
const riskTotalEl = document.getElementById("risk-total");
const riskGridEl = document.getElementById("risk-grid");
const riskListEl = document.getElementById("risk-list");

const momentumForm = document.getElementById("momentum-form");
const momentumWeekInput = document.getElementById("momentum-week");
const momentumScoreInput = document.getElementById("momentum-score");
const momentumTrendEl = document.getElementById("momentum-trend");
const stagnationAlertEl = document.getElementById("stagnation-alert");
const momentumBarsEl = document.getElementById("momentum-bars");

const leverageCanvas = document.getElementById("leverage-chart");
const leverageGapEl = document.getElementById("leverage-gap");
const navButtons = Array.from(document.querySelectorAll(".nav-btn"));

const kpiActiveMissionsEl = document.getElementById("kpi-active-missions");
const kpiTotalPhasesEl = document.getElementById("kpi-total-phases");
const kpiTotalMovesEl = document.getElementById("kpi-total-moves");
const kpiMomentumAvgEl = document.getElementById("kpi-momentum-avg");
const dashboardRecentMissionsEl = document.getElementById("dashboard-recent-missions");
const dashboardLeverageBarsEl = document.getElementById("dashboard-leverage-bars");
const dashboardRecentMomentumEl = document.getElementById("dashboard-recent-momentum");
const drawerBackdrop = document.getElementById("drawer-backdrop");
const missionDrawer = document.getElementById("mission-drawer");
const drawerTitleEl = document.getElementById("drawer-title");
const drawerSubtitleEl = document.getElementById("drawer-subtitle");
const drawerCycleMissionBtn = document.getElementById("drawer-cycle-mission");
const drawerCloseBtn = document.getElementById("drawer-close");
const drawerPhaseForm = document.getElementById("drawer-phase-form");
const drawerPhaseTitleInput = document.getElementById("drawer-phase-title");
const drawerPhasesEl = document.getElementById("drawer-phases");
const drawerMoveForm = document.getElementById("drawer-move-form");
const drawerMoveTitleInput = document.getElementById("drawer-move-title");
const drawerMoveLeverageSelect = document.getElementById("drawer-move-leverage");
const drawerMovePhaseSelect = document.getElementById("drawer-move-phase");
const drawerMovesEl = document.getElementById("drawer-moves");
const drawerLeverageBarsEl = document.getElementById("drawer-leverage-bars");

const concealToggle = document.getElementById("escape-toggle");
const vaultForm = document.getElementById("vault-form");
const vaultPassphraseInput = document.getElementById("vault-passphrase");
const vaultPrimaryBtn = document.getElementById("vault-primary");
const vaultLockBtn = document.getElementById("vault-lock");
const vaultRotateBtn = document.getElementById("vault-rotate");
const vaultStatusEl = document.getElementById("vault-status");
const themeSelect = document.getElementById("theme-select");
const commandPalette = document.getElementById("command-palette");
const commandInput = document.getElementById("command-input");
const commandList = document.getElementById("command-list");

init().catch(() => {
  setVaultStatus("Vault initialization failed.", true);
});

async function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || "auto");
  bindEvents();
  drawRiskGridBase();
  setView(activeView);
  registerSW();

  const encryptedPayload = readEncryptedPayload();
  if (encryptedPayload) {
    lockVaultUI("Vault found. Enter passphrase to unlock.");
    return;
  }

  bootState = loadLegacyState();
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  lockVaultUI("Set a new passphrase to initialize encrypted vault storage.");
}

function bindEvents() {
  for (const btn of navButtons) {
    btn.addEventListener("click", () => {
      setView(btn.dataset.view);
    });
  }

  themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value);
  });

  missionSearchInput.addEventListener("input", () => {
    searchTerm = missionSearchInput.value.trim().toLowerCase();
    renderMissions();
  });

  tagFilterInput.addEventListener("input", () => {
    tagFilter = tagFilterInput.value.trim().toLowerCase();
    renderMissions();
  });

  showArchivedInput.addEventListener("change", () => {
    showArchived = showArchivedInput.checked;
    renderMissions();
  });

  undoBtn.addEventListener("click", async () => {
    await applyUndo();
  });

  redoBtn.addEventListener("click", async () => {
    await applyRedo();
  });

  drawerCloseBtn.addEventListener("click", closeMissionDrawer);
  drawerBackdrop.addEventListener("click", closeMissionDrawer);

  drawerCycleMissionBtn.addEventListener("click", async () => {
    const mission = getSelectedMission();
    if (!mission) {
      return;
    }
    mission.status = nextStatus(mission.status);
    await saveAndRender();
  });

  drawerPhaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mission = getSelectedMission();
    if (!mission) {
      return;
    }
    const title = drawerPhaseTitleInput.value.trim();
    if (!title) {
      return;
    }
    mission.phases.push({ id: uid(), title });
    drawerPhaseTitleInput.value = "";
    await saveAndRender();
  });

  drawerMoveForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mission = getSelectedMission();
    if (!mission) {
      return;
    }
    const title = drawerMoveTitleInput.value.trim();
    const leverageType = drawerMoveLeverageSelect.value;
    const phaseId = drawerMovePhaseSelect.value;
    if (!title || !phaseId) {
      return;
    }
    mission.strategicMoves.push({
      id: uid(),
      title,
      tags: [],
      leverageType,
      priority: "Medium",
      deadline: null,
      progress: 0,
      color: "default",
      phaseId,
      archived: false,
      status: "Planning"
    });
    drawerMoveTitleInput.value = "";
    await saveAndRender();
  });

  missionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireUnlocked()) {
      return;
    }

    const title = missionTitleInput.value.trim();
    const horizonYears = Number(missionHorizonInput.value);

    if (!title || !inRange(horizonYears, 1, 5)) {
      return;
    }

    const mission = {
      id: uid(),
      title,
      horizonYears,
      status: "Planning",
      phases: [],
      strategicMoves: [],
      createdAt: Date.now()
    };

    state.missions.unshift(mission);
    await saveAndRender();
    missionForm.reset();
    missionHorizonInput.value = "3";
  });

  riskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireUnlocked()) {
      return;
    }

    const title = riskTitleInput.value.trim();
    const probability = Number(riskProbInput.value);
    const impact = Number(riskImpactInput.value);

    if (!title || !inRange(probability, 1, 10) || !inRange(impact, 1, 10)) {
      return;
    }

    state.riskPoints.unshift({
      id: uid(),
      title,
      probability,
      impact,
      createdAt: Date.now()
    });

    await saveAndRender();
    riskForm.reset();
    riskProbInput.value = "5";
    riskImpactInput.value = "5";
  });

  momentumForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireUnlocked()) {
      return;
    }

    const week = momentumWeekInput.value;
    const score = Number(momentumScoreInput.value);

    if (!week || !inRange(score, 0, 10)) {
      return;
    }

    const existing = state.momentumLogs.find((item) => item.week === week);
    if (existing) {
      existing.score = score;
      existing.updatedAt = Date.now();
    } else {
      state.momentumLogs.push({
        id: uid(),
        week,
        score,
        createdAt: Date.now()
      });
    }

    state.momentumLogs.sort((a, b) => a.week.localeCompare(b.week));
    await saveAndRender();
    momentumForm.reset();
    momentumWeekInput.value = todayISO();
    momentumScoreInput.value = "5";
  });

  vaultForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passphrase = vaultPassphraseInput.value;
    if (passphrase.length < 8) {
      setVaultStatus("Passphrase must be at least 8 characters.", true);
      return;
    }

    const encryptedPayload = readEncryptedPayload();
    if (encryptedPayload) {
      await unlockVault(passphrase, encryptedPayload);
      return;
    }

    await setupNewVault(passphrase);
  });

  vaultLockBtn.addEventListener("click", () => {
    lockVaultUI("Vault locked.");
  });

  vaultRotateBtn.addEventListener("click", async () => {
    if (!requireUnlocked()) {
      return;
    }

    const nextPassphrase = vaultPassphraseInput.value;
    if (nextPassphrase.length < 8) {
      setVaultStatus("Enter a new passphrase (min 8 chars) to rotate key.", true);
      return;
    }

    await persistEncryptedState(nextPassphrase);
    sessionPassphrase = nextPassphrase;
    vaultPassphraseInput.value = "";
    setVaultStatus("Vault key rotated.");
  });

  concealToggle.addEventListener("click", toggleConcealment);

  window.addEventListener("keydown", (event) => {
    if (isUnlocked) {
      bumpAutoLockTimer();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      toggleCommandPalette();
      return;
    }
    if (event.key.toLowerCase() === "g" && event.shiftKey) {
      setView("dashboard");
    }
    if (event.key.toLowerCase() === "m" && event.shiftKey) {
      setView("missions");
    }
    if (event.key.toLowerCase() === "r" && event.shiftKey) {
      setView("risk");
    }
    if (event.key.toLowerCase() === "o" && event.shiftKey) {
      setView("momentum");
    }
    if (event.key === "Escape") {
      if (!commandPalette.classList.contains("hidden")) {
        closeCommandPalette();
        return;
      }
      toggleConcealment();
    }
  });

  commandInput.addEventListener("input", renderCommandPalette);
  commandPalette.addEventListener("click", (event) => {
    if (event.target === commandPalette) {
      closeCommandPalette();
    }
  });

  const activityEvents = ["pointerdown", "mousemove", "touchstart", "scroll"];
  for (const eventName of activityEvents) {
    window.addEventListener(
      eventName,
      () => {
        if (isUnlocked) {
          bumpAutoLockTimer();
        }
      },
      { passive: true }
    );
  }
}

async function setupNewVault(passphrase) {
  state = structuredCloneSafe(bootState);
  undoStack = [];
  redoStack = [];
  lastSnapshot = JSON.stringify(state);
  await persistEncryptedState(passphrase);
  sessionPassphrase = passphrase;
  isUnlocked = true;
  bumpAutoLockTimer();
  syncVaultUI();
  renderAll();
  vaultPassphraseInput.value = "";
  setVaultStatus("Encrypted vault initialized and unlocked.");
}

async function unlockVault(passphrase, payload) {
  try {
    const decrypted = await decryptState(passphrase, payload);
    state = normalizeState(decrypted);
    undoStack = [];
    redoStack = [];
    lastSnapshot = JSON.stringify(state);
    sessionPassphrase = passphrase;
    isUnlocked = true;
    bumpAutoLockTimer();
    syncVaultUI();
    renderAll();
    vaultPassphraseInput.value = "";
    setVaultStatus("Vault unlocked.");
  } catch {
    setVaultStatus("Unlock failed. Incorrect passphrase or corrupted data.", true);
  }
}

function lockVaultUI(message) {
  isUnlocked = false;
  sessionPassphrase = "";
  clearAutoLockTimer();
  closeMissionDrawer();
  state = freshState();
  undoStack = [];
  redoStack = [];
  lastSnapshot = JSON.stringify(state);
  renderAll();
  syncVaultUI();
  setVaultStatus(message || "Vault locked.");
}

function syncVaultUI() {
  document.body.classList.toggle("vault-locked", !isUnlocked);

  if (isUnlocked) {
    vaultPrimaryBtn.textContent = "Unlock";
    vaultPrimaryBtn.disabled = true;
    vaultLockBtn.hidden = false;
    vaultRotateBtn.hidden = false;
    missionTitleInput.focus();
    if (!state.momentumLogs.length) {
      momentumWeekInput.value = todayISO();
    }
  } else {
    vaultPrimaryBtn.disabled = false;
    vaultPrimaryBtn.textContent = readEncryptedPayload() ? "Unlock" : "Set Passphrase";
    vaultLockBtn.hidden = true;
    vaultRotateBtn.hidden = true;
    vaultPassphraseInput.focus();
  }
}

function requireUnlocked() {
  if (isUnlocked) {
    return true;
  }

  setVaultStatus("Vault is locked. Unlock to continue.", true);
  return false;
}

function renderAll() {
  renderDashboard();
  renderMissions();
  renderLeverage();
  renderRisks();
  renderMomentum();
  renderMissionDrawer();
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

function renderDashboard() {
  const missions = state.missions;
  const allMoves = missions.flatMap((mission) => (mission.strategicMoves || []).filter((move) => !move.archived));
  const activeMissions = missions.filter((mission) => mission.status === "Active").length;
  const totalPhases = missions.reduce((sum, mission) => sum + mission.phases.length, 0);
  const momentumAvg = state.momentumLogs.length
    ? (state.momentumLogs.reduce((sum, log) => sum + log.score, 0) / state.momentumLogs.length).toFixed(1)
    : "0.0";

  kpiActiveMissionsEl.textContent = `${activeMissions}`;
  kpiTotalPhasesEl.textContent = `${totalPhases}`;
  kpiTotalMovesEl.textContent = `${allMoves.length}`;
  kpiMomentumAvgEl.textContent = `${momentumAvg}`;

  dashboardRecentMissionsEl.innerHTML = "";
  const recentMissions = [...missions]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 4);
  if (!recentMissions.length) {
    dashboardRecentMissionsEl.append(makeMeta("No missions recorded."));
  } else {
    for (const mission of recentMissions) {
      const row = document.createElement("div");
      row.className = "dashboard-row clickable";
      row.innerHTML = `<div><div>${escapeHTML(mission.title)}</div><small>${mission.horizonYears}-year arc</small></div><small>${mission.status}</small>`;
      row.addEventListener("click", () => openMissionDrawer(mission.id));
      dashboardRecentMissionsEl.append(row);
    }
  }

  dashboardLeverageBarsEl.innerHTML = "";
  const counts = leverageCounts();
  const maxCount = Math.max(1, ...Object.values(counts));
  for (const type of LEVERAGE_TYPES) {
    const row = document.createElement("div");
    row.className = "lever-row";
    const width = (counts[type] / maxCount) * 100;
    row.innerHTML = `<span>${type}</span><div class="lever-track"><div class="lever-fill" style="width:${width}%"></div></div><strong>${counts[type]}</strong>`;
    dashboardLeverageBarsEl.append(row);
  }

  dashboardRecentMomentumEl.innerHTML = "";
  const recentMomentum = [...state.momentumLogs].sort((a, b) => b.week.localeCompare(a.week)).slice(0, 5);
  if (!recentMomentum.length) {
    dashboardRecentMomentumEl.append(makeMeta("No momentum logs recorded."));
  } else {
    for (const log of recentMomentum) {
      const row = document.createElement("div");
      row.className = "dashboard-row";
      row.innerHTML = `<div><div>${shortDate(log.week)}</div><small>Weekly signal</small></div><strong>${log.score}</strong>`;
      dashboardRecentMomentumEl.append(row);
    }
  }
}

function renderMissions() {
  missionsList.innerHTML = "";
  const missions = filteredMissions();
  if (!missions.length) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = isUnlocked
      ? "No missions match the current filters."
      : "Vault locked.";
    missionsList.append(empty);
    return;
  }

  for (const mission of missions) {
    const node = missionTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.missionId = mission.id;
    node.querySelector("h3").textContent = mission.title;
    node.querySelector(".pill").textContent = mission.status;
    node.querySelector(".meta").textContent = `${mission.horizonYears}-year arc • ${mission.phases.length} phases • ${mission.strategicMoves.length} moves`;

    const phaseForm = node.querySelector(".phase-form");
    phaseForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = phaseForm.querySelector(".phase-title");
      const title = input.value.trim();
      if (!title) {
        return;
      }
      mission.phases.push({ id: uid(), title });
      await saveAndRender();
    });

    const moveForm = node.querySelector(".move-form");
    const movePhaseSelect = moveForm.querySelector(".move-phase");
    hydrateMovePhaseSelect(movePhaseSelect, mission.phases);

    moveForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = moveForm.querySelector(".move-title").value.trim();
      const tags = parseTags(moveForm.querySelector(".move-tags").value);
      const leverageType = moveForm.querySelector(".move-leverage").value;
      const priority = moveForm.querySelector(".move-priority").value;
      const deadline = moveForm.querySelector(".move-deadline").value || null;
      const progress = clampNum(Number(moveForm.querySelector(".move-progress").value), 0, 100, 0);
      const color = moveForm.querySelector(".move-color").value;
      const phaseId = moveForm.querySelector(".move-phase").value;

      if (!title || !phaseId) {
        return;
      }

      mission.strategicMoves.push({
        id: uid(),
        title,
        tags,
        leverageType,
        priority,
        deadline,
        progress,
        color,
        phaseId,
        archived: false,
        status: "Planning"
      });

      await saveAndRender();
    });

    const phaseWrap = node.querySelector(".phases");
    if (!mission.phases.length) {
      phaseWrap.append(makeMeta("No phases yet."));
    } else {
      for (const phase of mission.phases) {
        const row = document.createElement("div");
        row.className = "phase-row";
        row.innerHTML = `<span>${escapeHTML(phase.title)}</span><small>Phase</small>`;
        phaseWrap.append(row);
      }
    }

    const moveWrap = node.querySelector(".moves");
    const visibleMoves = mission.strategicMoves.filter((move) => {
      if (!showArchived && move.archived) {
        return false;
      }
      return true;
    });

    if (!visibleMoves.length) {
      moveWrap.append(makeMeta("No strategic moves yet."));
    } else {
      for (const move of visibleMoves) {
        const phase = mission.phases.find((p) => p.id === move.phaseId);
        const row = document.createElement("div");
        row.className = `move-row ${move.color && move.color !== "default" ? `color-${move.color}` : ""}`.trim();

        const left = document.createElement("div");
        const tags = move.tags?.length ? ` • #${move.tags.join(" #")}` : "";
        const deadline = move.deadline ? ` • due ${shortDate(move.deadline)}` : "";
        const archivedLabel = move.archived ? " • archived" : "";
        left.innerHTML = `<div>${escapeHTML(move.title)}</div><small>${move.leverageType}${phase ? ` • ${escapeHTML(phase.title)}` : ""} • ${move.priority}${deadline}${tags}${archivedLabel}</small><div class="progress-track"><div class="progress-fill" style="width:${clampNum(move.progress ?? 0, 0, 100, 0)}%"></div></div>`;

        const actions = document.createElement("div");
        actions.className = "action-row";
        const statusBtn = document.createElement("button");
        statusBtn.type = "button";
        statusBtn.textContent = move.status;
        statusBtn.addEventListener("click", async () => {
          move.status = nextStatus(move.status);
          mission.status = missionDerivedStatus(mission);
          await saveAndRender();
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.textContent = "Remove";
        deleteBtn.addEventListener("click", async () => {
          mission.strategicMoves = mission.strategicMoves.filter((m) => m.id !== move.id);
          mission.status = missionDerivedStatus(mission);
          await saveAndRender();
        });

        const archiveBtn = document.createElement("button");
        archiveBtn.type = "button";
        archiveBtn.textContent = move.archived ? "Restore" : "Archive";
        archiveBtn.addEventListener("click", async () => {
          move.archived = !move.archived;
          await saveAndRender();
        });

        actions.append(statusBtn, archiveBtn, deleteBtn);
        row.append(left, actions);
        moveWrap.append(row);
      }
    }

    const top = node.querySelector(".mission-top");
    const statusCycle = document.createElement("button");
    statusCycle.type = "button";
    statusCycle.textContent = "Cycle Mission";
    statusCycle.addEventListener("click", async () => {
      mission.status = nextStatus(mission.status);
      await saveAndRender();
    });

    const removeMission = document.createElement("button");
    removeMission.type = "button";
    removeMission.textContent = "Delete";
    removeMission.addEventListener("click", async () => {
      state.missions = state.missions.filter((m) => m.id !== mission.id);
      if (selectedMissionId === mission.id) {
        selectedMissionId = null;
      }
      await saveAndRender();
    });

    const inspectMission = document.createElement("button");
    inspectMission.type = "button";
    inspectMission.textContent = "Inspect";
    inspectMission.addEventListener("click", () => openMissionDrawer(mission.id));

    const controls = document.createElement("div");
    controls.className = "action-row";
    controls.append(inspectMission, statusCycle, removeMission);
    top.append(controls);

    missionsList.append(node);
  }
}

function hydrateMovePhaseSelect(select, phases) {
  select.innerHTML = "";
  if (!phases.length) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Add phase first";
    select.append(placeholder);
    return;
  }

  for (const phase of phases) {
    const option = document.createElement("option");
    option.value = phase.id;
    option.textContent = phase.title;
    select.append(option);
  }
}

function renderLeverage() {
  const counts = leverageCounts();

  drawLeverageChart(counts);

  const values = Object.values(counts);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const gapTypes = LEVERAGE_TYPES.filter((type) => counts[type] === min);
  leverageGapEl.textContent = `Strategic gap: ${gapTypes.join(", ")} (${min}) • Max concentration: ${max}`;
}

function drawLeverageChart(counts) {
  const ctx = leverageCanvas.getContext("2d");
  const width = leverageCanvas.width;
  const height = leverageCanvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.36;
  const maxValue = Math.max(1, ...Object.values(counts));

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(138,138,150,0.32)";
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring += 1) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, (radius * ring) / 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  const points = [];
  LEVERAGE_TYPES.forEach((type, index) => {
    const angle = -Math.PI / 2 + (index / LEVERAGE_TYPES.length) * Math.PI * 2;
    const axisX = centerX + Math.cos(angle) * radius;
    const axisY = centerY + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(axisX, axisY);
    ctx.strokeStyle = "rgba(138,138,150,0.25)";
    ctx.stroke();

    ctx.fillStyle = "#a9a9b4";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(type, centerX + Math.cos(angle) * (radius + 18), centerY + Math.sin(angle) * (radius + 18));

    const scaled = (counts[type] / maxValue) * radius;
    points.push({
      x: centerX + Math.cos(angle) * scaled,
      y: centerY + Math.sin(angle) * scaled
    });
  });

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(138,138,150,0.34)";
  ctx.strokeStyle = "rgba(220,220,230,0.76)";
  ctx.lineWidth = 1.4;
  ctx.fill();
  ctx.stroke();
}

function drawRiskGridBase() {
  riskGridEl.innerHTML = "";
  for (let row = 10; row >= 1; row -= 1) {
    for (let col = 1; col <= 10; col += 1) {
      const cell = document.createElement("div");
      cell.className = "risk-cell";
      cell.dataset.cell = `${row}-${col}`;
      riskGridEl.append(cell);
    }
  }
}

function renderRisks() {
  const cells = Array.from(riskGridEl.children);
  cells.forEach((cell) => cell.classList.remove("active"));

  let sum = 0;
  let peak = 0;
  riskListEl.innerHTML = "";

  for (const risk of state.riskPoints) {
    const exposure = risk.probability * risk.impact;
    sum += exposure;
    peak = Math.max(peak, exposure);

    const key = `${risk.impact}-${risk.probability}`;
    const cell = cells.find((item) => item.dataset.cell === key);
    if (cell) {
      cell.classList.add("active");
    }

    const row = document.createElement("div");
    row.className = "risk-row";

    const left = document.createElement("div");
    left.innerHTML = `<div>${escapeHTML(risk.title)}</div><small>P${risk.probability} x I${risk.impact} = ${exposure}</small>`;

    const actions = document.createElement("div");
    actions.className = "action-row";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Remove";
    deleteBtn.addEventListener("click", async () => {
      state.riskPoints = state.riskPoints.filter((item) => item.id !== risk.id);
      await saveAndRender();
    });

    actions.append(deleteBtn);
    row.append(left, actions);
    riskListEl.append(row);
  }

  const avg = state.riskPoints.length ? (sum / state.riskPoints.length).toFixed(1) : "0";
  riskTotalEl.textContent = `Total Risks: ${state.riskPoints.length}`;
  avgExposureEl.textContent = `Average Exposure: ${avg}`;
  peakExposureEl.textContent = `Peak Exposure: ${peak}`;

  if (!state.riskPoints.length) {
    riskListEl.append(makeMeta("No risk points logged."));
  }
}

function renderMomentum() {
  momentumBarsEl.innerHTML = "";
  const logs = [...state.momentumLogs].sort((a, b) => a.week.localeCompare(b.week));

  logs.forEach((log) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    const weekLabel = document.createElement("span");
    weekLabel.textContent = shortDate(log.week);

    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(log.score / 10) * 100}%`;
    track.append(fill);

    const val = document.createElement("strong");
    val.textContent = `${log.score}`;

    bar.append(weekLabel, track, val);
    momentumBarsEl.append(bar);
  });

  if (!logs.length) {
    momentumBarsEl.append(makeMeta("No momentum logs yet."));
  }

  const trend = momentumTrend(logs);
  momentumTrendEl.textContent = `Trend: ${trend}`;
  momentumTrendEl.classList.remove("warn", "good");
  if (trend === "Accelerating") {
    momentumTrendEl.classList.add("good");
  } else if (trend === "Decelerating") {
    momentumTrendEl.classList.add("warn");
  }

  const stagnation = stagnationState(logs);
  stagnationAlertEl.textContent = `Stagnation: ${stagnation}`;
  stagnationAlertEl.classList.remove("warn", "good");
  if (stagnation.includes("Alert")) {
    stagnationAlertEl.classList.add("warn");
  } else if (stagnation.includes("Clear")) {
    stagnationAlertEl.classList.add("good");
  }
}

function momentumTrend(logs) {
  if (logs.length < 3) {
    return "Insufficient data";
  }

  const last3 = logs.slice(-3).map((entry) => entry.score);
  const diffA = last3[1] - last3[0];
  const diffB = last3[2] - last3[1];

  if (diffA > 0 && diffB > 0) {
    return "Accelerating";
  }

  if (diffA < 0 && diffB < 0) {
    return "Decelerating";
  }

  return "Steady";
}

function stagnationState(logs) {
  if (logs.length < 4) {
    return "Insufficient data";
  }

  const last4 = logs.slice(-4).map((entry) => entry.score);
  const min = Math.min(...last4);
  const max = Math.max(...last4);

  if (max - min <= 1) {
    return "Alert: flat 4-week pattern";
  }

  return "Clear";
}

function missionDerivedStatus(mission) {
  if (!mission.strategicMoves.length) {
    return "Planning";
  }

  if (mission.strategicMoves.every((move) => move.status === "Completed")) {
    return "Completed";
  }

  if (mission.strategicMoves.some((move) => move.status === "Active")) {
    return "Active";
  }

  if (mission.strategicMoves.every((move) => move.status === "Abandoned")) {
    return "Abandoned";
  }

  return "Planning";
}

function nextStatus(current) {
  const idx = MISSION_STATUS.indexOf(current);
  if (idx === -1) {
    return MISSION_STATUS[0];
  }
  return MISSION_STATUS[(idx + 1) % MISSION_STATUS.length];
}

function toggleConcealment() {
  document.body.classList.toggle("concealed");
}

function openMissionDrawer(missionId) {
  if (!isUnlocked) {
    setVaultStatus("Vault is locked. Unlock to inspect mission details.", true);
    return;
  }
  selectedMissionId = missionId;
  renderMissionDrawer();
  document.body.classList.add("drawer-open");
  drawerBackdrop.hidden = false;
  missionDrawer.setAttribute("aria-hidden", "false");
}

function closeMissionDrawer() {
  selectedMissionId = null;
  document.body.classList.remove("drawer-open");
  drawerBackdrop.hidden = true;
  missionDrawer.setAttribute("aria-hidden", "true");
}

function getSelectedMission() {
  if (!selectedMissionId) {
    return null;
  }
  return state.missions.find((mission) => mission.id === selectedMissionId) || null;
}

function renderMissionDrawer() {
  if (!selectedMissionId) {
    closeMissionDrawer();
    return;
  }

  const mission = getSelectedMission();
  if (!mission) {
    selectedMissionId = null;
    closeMissionDrawer();
    return;
  }

  drawerTitleEl.textContent = mission.title;
  drawerSubtitleEl.textContent = `${mission.horizonYears}-year arc • ${mission.status} • ${mission.phases.length} phases • ${mission.strategicMoves.length} moves`;

  drawerPhasesEl.innerHTML = "";
  if (!mission.phases.length) {
    drawerPhasesEl.append(makeMeta("No phases yet."));
  } else {
    for (const phase of mission.phases) {
      const phaseMoves = mission.strategicMoves.filter((move) => move.phaseId === phase.id).length;
      const row = document.createElement("div");
      row.className = "dashboard-row";
      row.innerHTML = `<div>${escapeHTML(phase.title)}</div><small>${phaseMoves} moves</small>`;
      drawerPhasesEl.append(row);
    }
  }

  hydrateMovePhaseSelect(drawerMovePhaseSelect, mission.phases);

  drawerMovesEl.innerHTML = "";
  if (!mission.strategicMoves.length) {
    drawerMovesEl.append(makeMeta("No strategic moves yet."));
  } else {
    for (const move of mission.strategicMoves) {
      const row = document.createElement("div");
      row.className = "move-row";
      const phase = mission.phases.find((item) => item.id === move.phaseId);
      const left = document.createElement("div");
      const tags = move.tags?.length ? ` • #${move.tags.join(" #")}` : "";
      left.innerHTML = `<div>${escapeHTML(move.title)}</div><small>${move.leverageType}${phase ? ` • ${escapeHTML(phase.title)}` : ""} • ${move.priority}${tags}</small><div class="progress-track"><div class="progress-fill" style="width:${clampNum(move.progress ?? 0, 0, 100, 0)}%"></div></div>`;
      const actions = document.createElement("div");
      actions.className = "action-row";

      const statusBtn = document.createElement("button");
      statusBtn.type = "button";
      statusBtn.textContent = move.status;
      statusBtn.addEventListener("click", async () => {
        move.status = nextStatus(move.status);
        mission.status = missionDerivedStatus(mission);
        await saveAndRender();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "Remove";
      deleteBtn.addEventListener("click", async () => {
        mission.strategicMoves = mission.strategicMoves.filter((item) => item.id !== move.id);
        mission.status = missionDerivedStatus(mission);
        await saveAndRender();
      });

      const archiveBtn = document.createElement("button");
      archiveBtn.type = "button";
      archiveBtn.textContent = move.archived ? "Restore" : "Archive";
      archiveBtn.addEventListener("click", async () => {
        move.archived = !move.archived;
        await saveAndRender();
      });

      actions.append(statusBtn, archiveBtn, deleteBtn);
      row.append(left, actions);
      drawerMovesEl.append(row);
    }
  }

  const counts = missionLeverageCounts(mission);
  drawerLeverageBarsEl.innerHTML = "";
  const maxCount = Math.max(1, ...Object.values(counts));
  for (const type of LEVERAGE_TYPES) {
    const row = document.createElement("div");
    row.className = "lever-row";
    const width = (counts[type] / maxCount) * 100;
    row.innerHTML = `<span>${type}</span><div class="lever-track"><div class="lever-fill" style="width:${width}%"></div></div><strong>${counts[type]}</strong>`;
    drawerLeverageBarsEl.append(row);
  }
}

function setView(viewName) {
  activeView = viewName;
  const views = ["dashboard", "missions", "risk", "momentum"];
  for (const view of views) {
    const node = document.getElementById(`view-${view}`);
    if (!node) {
      continue;
    }
    node.classList.toggle("hidden-view", view !== viewName);
  }

  for (const btn of navButtons) {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-steel");
  if (theme === "light") {
    root.classList.add("theme-light");
  } else if (theme === "steel") {
    root.classList.add("theme-steel");
  } else if (theme === "auto") {
    if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      root.classList.add("theme-light");
    }
  }
  if (themeSelect.value !== theme) {
    themeSelect.value = theme;
  }
  localStorage.setItem(THEME_KEY, theme);
}

function filteredMissions() {
  return state.missions.filter((mission) => {
    const missionText = mission.title.toLowerCase();
    const moveText = mission.strategicMoves
      .map((move) => `${move.title} ${move.tags?.join(" ") || ""}`.toLowerCase())
      .join(" ");
    const searchOk = !searchTerm || missionText.includes(searchTerm) || moveText.includes(searchTerm);
    const tagOk = !tagFilter || mission.strategicMoves.some((move) => (move.tags || []).some((tag) => tag.includes(tagFilter)));
    const archiveOk = showArchived || mission.strategicMoves.some((move) => !move.archived);
    return searchOk && tagOk && archiveOk;
  });
}

function parseTags(raw) {
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function clampNum(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function getCommands() {
  return [
    { id: "view-dashboard", label: "Go Dashboard", run: () => setView("dashboard") },
    { id: "view-missions", label: "Go Missions", run: () => setView("missions") },
    { id: "view-risk", label: "Go Risk Surface", run: () => setView("risk") },
    { id: "view-momentum", label: "Go Momentum", run: () => setView("momentum") },
    { id: "toggle-conceal", label: "Toggle Conceal Mode", run: () => toggleConcealment() },
    { id: "lock-vault", label: "Lock Vault", run: () => lockVaultUI("Vault locked.") },
    { id: "undo", label: "Undo", run: async () => applyUndo() },
    { id: "redo", label: "Redo", run: async () => applyRedo() }
  ];
}

function toggleCommandPalette() {
  if (commandPalette.classList.contains("hidden")) {
    commandPalette.classList.remove("hidden");
    commandPalette.setAttribute("aria-hidden", "false");
    commandInput.value = "";
    renderCommandPalette();
    commandInput.focus();
  } else {
    closeCommandPalette();
  }
}

function closeCommandPalette() {
  commandPalette.classList.add("hidden");
  commandPalette.setAttribute("aria-hidden", "true");
}

function renderCommandPalette() {
  const term = commandInput.value.trim().toLowerCase();
  const commands = getCommands().filter((command) => !term || command.label.toLowerCase().includes(term));
  commandList.innerHTML = "";
  for (const command of commands) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "command-item";
    btn.textContent = command.label;
    btn.addEventListener("click", async () => {
      closeCommandPalette();
      await command.run();
    });
    commandList.append(btn);
  }
}

async function applyUndo() {
  if (!undoStack.length) {
    return;
  }
  redoStack.push(JSON.stringify(state));
  state = JSON.parse(undoStack.pop());
  lastSnapshot = JSON.stringify(state);
  await saveAndRender(false);
}

async function applyRedo() {
  if (!redoStack.length) {
    return;
  }
  undoStack.push(JSON.stringify(state));
  state = JSON.parse(redoStack.pop());
  lastSnapshot = JSON.stringify(state);
  await saveAndRender(false);
}

function leverageCounts() {
  const counts = Object.fromEntries(LEVERAGE_TYPES.map((type) => [type, 0]));
  for (const mission of state.missions) {
    for (const move of mission.strategicMoves) {
      if (move.archived) {
        continue;
      }
      counts[move.leverageType] += 1;
    }
  }
  return counts;
}

function missionLeverageCounts(mission) {
  const counts = Object.fromEntries(LEVERAGE_TYPES.map((type) => [type, 0]));
  for (const move of mission.strategicMoves) {
    if (move.archived) {
      continue;
    }
    counts[move.leverageType] += 1;
  }
  return counts;
}

function bumpAutoLockTimer() {
  clearAutoLockTimer();
  autoLockTimer = setTimeout(() => {
    if (isUnlocked) {
      lockVaultUI("Auto-locked after 10 minutes of inactivity.");
    }
  }, AUTO_LOCK_MS);
}

function clearAutoLockTimer() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}

async function saveAndRender(trackHistory = true) {
  const snapshot = JSON.stringify(state);
  if (trackHistory && snapshot !== lastSnapshot) {
    undoStack.push(lastSnapshot);
    if (undoStack.length > 80) {
      undoStack.shift();
    }
    redoStack = [];
  }
  lastSnapshot = snapshot;
  if (isUnlocked && sessionPassphrase) {
    await persistEncryptedState(sessionPassphrase);
  }
  renderAll();
}

async function persistEncryptedState(passphrase) {
  const payload = await encryptState(passphrase, state);
  localStorage.setItem(ENCRYPTED_STORAGE_KEY, JSON.stringify(payload));
}

function loadLegacyState() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return freshState();
    }
    return normalizeState(JSON.parse(raw));
  } catch {
    return freshState();
  }
}

function readEncryptedPayload() {
  try {
    const raw = localStorage.getItem(ENCRYPTED_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function encryptState(passphrase, clearState) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt, KDF_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(clearState));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations: KDF_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted))
  };
}

async function decryptState(passphrase, payload) {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const iterations = Number(payload.iterations) || KDF_ITERATIONS;

  const key = await deriveAesKey(passphrase, salt, iterations);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const text = new TextDecoder().decode(decrypted);
  return JSON.parse(text);
}

async function deriveAesKey(passphrase, salt, iterations) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function setVaultStatus(message, isError = false) {
  vaultStatusEl.textContent = message;
  vaultStatusEl.classList.toggle("warn", isError);
  vaultStatusEl.classList.toggle("good", !isError && Boolean(message));
}

function freshState() {
  return {
    missions: [],
    riskPoints: [],
    momentumLogs: []
  };
}

function normalizeState(input) {
  const missions = Array.isArray(input?.missions) ? input.missions : [];
  for (const mission of missions) {
    mission.phases = Array.isArray(mission.phases) ? mission.phases : [];
    mission.strategicMoves = Array.isArray(mission.strategicMoves) ? mission.strategicMoves : [];
    for (const move of mission.strategicMoves) {
      move.tags = Array.isArray(move.tags) ? move.tags : [];
      move.priority = move.priority || "Medium";
      move.deadline = move.deadline || null;
      move.progress = clampNum(Number(move.progress ?? 0), 0, 100, 0);
      move.color = move.color || "default";
      move.archived = Boolean(move.archived);
    }
  }
  return {
    missions,
    riskPoints: Array.isArray(input?.riskPoints) ? input.riskPoints : [],
    momentumLogs: Array.isArray(input?.momentumLogs) ? input.momentumLogs : []
  };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function inRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(value) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function makeMeta(text) {
  const p = document.createElement("p");
  p.className = "meta";
  p.textContent = text;
  return p;
}

function escapeHTML(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
