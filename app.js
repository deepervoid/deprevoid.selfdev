import { h, render } from "https://esm.sh/preact@10.19.3";
import { useState, useEffect, useMemo } from "https://esm.sh/preact@10.19.3/hooks";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(h);

// ---------- storage ----------
const KEYS = {
  daily: "kaz-dashboard-daily-logs",
  training: "kaz-dashboard-training",
  freelance: "kaz-dashboard-freelance",
  goals: "kaz-dashboard-goals",
  issuesEvents: "kaz-dashboard-issues-events",
};
function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("save failed", key, e);
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

function qualityColor(q) {
  const t = Math.max(0, Math.min(1, (q - 1) / 9));
  const from = { r: 196, g: 60, b: 63 };
  const to = { r: 24, g: 42, b: 92 };
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  return `rgb(${r},${g},${b})`;
}

function parseTimeDecimal(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h + m / 60;
}
function computeSleepHours(bedTime, wakeTime) {
  const b = parseTimeDecimal(bedTime), w = parseTimeDecimal(wakeTime);
  if (b == null || w == null) return null;
  let raw = w - b;
  if (raw <= 0) raw += 24;
  return raw;
}
const SLEEP_MIN_HOURS = 6;

const TABS = [
  { id: "overview", label: "overview", n: "00" },
  { id: "daily", label: "daily log", n: "01" },
  { id: "heatmaps", label: "heatmaps", n: "02" },
  { id: "training", label: "training", n: "03" },
  { id: "academics", label: "academics", n: "04" },
  { id: "freelance", label: "freelance", n: "05" },
  { id: "goals", label: "goals", n: "06" },
  { id: "issues", label: "issues + events", n: "07" },
];

function daysSinceLastBackup() {
  const ts = localStorage.getItem("kaz-dashboard-last-backup");
  if (!ts) return null;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

function buildWeeks(daysBack) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - daysBack);
  start.setDate(start.getDate() - start.getDay()); // rewind to sunday
  const weeks = [];
  let cur = new Date(start);
  while (cur <= end) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}
const GOAL_TIERS = [
  { key: "daily", label: "daily" },
  { key: "weekly", label: "weekly" },
  { key: "monthly", label: "monthly" },
  { key: "quarterly", label: "quarterly" },
  { key: "yearly", label: "yearly" },
  { key: "fiveYear", label: "5 year" },
];

// ---------- tiny SVG charts (no external chart lib needed) ----------
function LineChartSVG({ data, valueKey, colorKey, height = 160 }) {
  if (!data.length) return null;
  const w = 300, h = height, pad = 22;
  const vals = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...vals, 1);
  const stepX = (w - pad * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((Number(d[valueKey]) || 0) / max) * (h - pad * 2);
    return { x, y, d };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return html`
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:${h}px;">
      <path d=${path} fill="none" stroke="#3B82C4" stroke-width="2" />
      ${points.map(
        (p, i) => html`<circle key=${i} cx=${p.x} cy=${p.y} r="4" fill=${colorKey ? qualityColor(p.d[colorKey]) : "#3B82C4"} />`
      )}
      ${points.map(
        (p, i) => i % Math.ceil(points.length / 6 || 1) === 0
          ? html`<text key=${"t" + i} x=${p.x} y=${h - 4} text-anchor="middle">${fmtDate(p.d.date)}</text>`
          : null
      )}
    </svg>
  `;
}

function BarChartSVG({ data, valueKey, colorFn, height = 160 }) {
  if (!data.length) return null;
  const w = 300, h = height, pad = 22;
  const vals = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...vals, 1);
  const barW = Math.min(28, (w - pad * 2) / data.length - 6);
  const stepX = (w - pad * 2) / data.length;
  return html`
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:${h}px;">
      ${data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const barH = (val / max) * (h - pad * 2);
        const x = pad + i * stepX + (stepX - barW) / 2;
        const y = h - pad - barH;
        const fill = colorFn ? colorFn(d) : "#3B82C4";
        return html`<rect key=${i} x=${x} y=${y} width=${barW} height=${barH} rx="3" fill=${fill} />`;
      })}
      ${data.map((d, i) =>
        i % Math.ceil(data.length / 6 || 1) === 0
          ? html`<text key=${"t" + i} x=${pad + i * stepX + stepX / 2} y=${h - 4} text-anchor="middle">${d.date}</text>`
          : null
      )}
    </svg>
  `;
}

function SleepStockChart({ data, height = 190 }) {
  if (!data.length) return null;
  const w = 300, h = height, padL = 28, padR = 10, padT = 12, padB = 24;
  const vals = data.map((d) => Number(d.sleepHours) || 0);
  const max = Math.max(10, ...vals) + 1;
  const scaleY = (v) => padT + (h - padT - padB) * (1 - v / max);
  const stepX = (w - padL - padR) / Math.max(1, data.length - 1);
  const scaleX = (i) => padL + i * stepX;
  const thresholdY = scaleY(SLEEP_MIN_HOURS);

  const points = data.map((d, i) => ({
    x: scaleX(i), y: scaleY(Number(d.sleepHours) || 0), v: Number(d.sleepHours) || 0, date: d.date,
  }));

  return html`
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:${h}px;">
      <line x1=${padL} y1=${thresholdY} x2=${w - padR} y2=${thresholdY} stroke="#8A8A8A" stroke-width="1" stroke-dasharray="4 4" />
      <text x=${padL + 4} y=${thresholdY - 5}>${SLEEP_MIN_HOURS}h min</text>

      ${points.slice(1).map((p, i) => {
        const prev = points[i];
        const avg = (p.v + prev.v) / 2;
        const color = avg >= SLEEP_MIN_HOURS ? "#4F9D69" : "#C0455C";
        return html`<line key=${i} x1=${prev.x} y1=${prev.y} x2=${p.x} y2=${p.y} stroke=${color} stroke-width="2" />`;
      })}
      ${points.map(
        (p, i) => html`<circle key=${i} cx=${p.x} cy=${p.y} r="3.5" fill=${p.v >= SLEEP_MIN_HOURS ? "#4F9D69" : "#C0455C"} />`
      )}
      ${points.map((p, i) =>
        i % Math.ceil(points.length / 6 || 1) === 0
          ? html`<text key=${"t" + i} x=${p.x} y=${h - 4} text-anchor="middle">${fmtDate(p.date)}</text>`
          : null
      )}
    </svg>
  `;
}

// ---------- shared bits ----------
function Card({ title, children }) {
  return html`
    <div class="card">
      <div class="card-title">${title}</div>
      ${children}
    </div>
  `;
}
function Field({ label, wide, children }) {
  return html`<label class="field ${wide ? "wide" : ""}"><span class="field-label">${label}</span>${children}</label>`;
}
function Empty({ text }) {
  return html`<div class="empty">${text}</div>`;
}
function HeadStat({ label, value, warn }) {
  return html`
    <div class="head-stat">
      <div class="head-stat-val ${warn ? "warn" : ""}">${value}</div>
      <div class="head-stat-label">${label}</div>
    </div>
  `;
}

// ================= APP =================
function App() {
  const [tab, setTab] = useState("overview");
  const [dailyLogs, setDailyLogsState] = useState(() => load(KEYS.daily, []));
  const [training, setTrainingState] = useState(() => load(KEYS.training, []));
  const [freelance, setFreelanceState] = useState(() => load(KEYS.freelance, []));
  const [goals, setGoalsState] = useState(() =>
    load(KEYS.goals, { daily: [], weekly: [], monthly: [], quarterly: [], yearly: [], fiveYear: [] })
  );
  const [issuesEvents, setIssuesEventsState] = useState(() =>
    load(KEYS.issuesEvents, { issues: [], events: [] })
  );

  const setDailyLogs = (fn) => setDailyLogsState((prev) => { const next = typeof fn === "function" ? fn(prev) : fn; save(KEYS.daily, next); return next; });
  const setTraining = (fn) => setTrainingState((prev) => { const next = typeof fn === "function" ? fn(prev) : fn; save(KEYS.training, next); return next; });
  const setFreelance = (fn) => setFreelanceState((prev) => { const next = typeof fn === "function" ? fn(prev) : fn; save(KEYS.freelance, next); return next; });
  const setGoals = (fn) => setGoalsState((prev) => { const next = typeof fn === "function" ? fn(prev) : fn; save(KEYS.goals, next); return next; });
  const setIssuesEvents = (fn) => setIssuesEventsState((prev) => { const next = typeof fn === "function" ? fn(prev) : fn; save(KEYS.issuesEvents, next); return next; });

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);

    const weekTraining = training.filter((t) => new Date(t.date) >= weekAgo);
    const kmWeek = weekTraining.reduce((s, t) => s + Number(t.distanceKm || 0), 0);

    const streak = (() => {
      let s = 0;
      const dates = new Set(dailyLogs.map((l) => l.date));
      let cur = new Date();
      while (dates.has(cur.toISOString().slice(0, 10))) { s++; cur.setDate(cur.getDate() - 1); }
      return s;
    })();

    const studyWeek = dailyLogs.filter((l) => new Date(l.date) >= weekAgo).reduce((s, l) => s + Number(l.studyHours || 0), 0);
    const incomeMonth = freelance.filter((f) => f.status === "paid" && new Date(f.date) >= monthAgo).reduce((s, f) => s + Number(f.amount || 0), 0);
    const openIssues = issuesEvents.issues.filter((i) => !i.resolved).length;
    const upcomingEvents = [...issuesEvents.events]
      .filter((e) => new Date(e.date) >= new Date(now.toDateString()))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 4);

    return { kmWeek, streak, studyWeek, incomeMonth, openIssues, upcomingEvents };
  }, [dailyLogs, training, freelance, issuesEvents]);

  const [backupTick, setBackupTick] = useState(0);
  const backupDays = useMemo(() => daysSinceLastBackup(), [backupTick]);

  return html`
    <div class="app">
      <div class="header">
        <div>
          <h1 class="brand-title">life dash.</h1>
          <div class="brand-sub">welcome bhuvan.</div>
        </div>
        <div class="head-stats">
          <${HeadStat} label="streak" value=${stats.streak + "d"} />
          <${HeadStat} label="km/wk" value=${stats.kmWeek.toFixed(0)} />
          <${HeadStat} label="study/wk" value=${stats.studyWeek.toFixed(1) + "h"} />
          <${HeadStat} label="open issues" value=${stats.openIssues} warn=${stats.openIssues > 0} />
        </div>
      </div>

      ${(backupDays === null || backupDays >= 7) && html`
        <div class="backup-banner" onClick=${() => setTab("overview")}>
          <span>${backupDays === null ? "no backups yet — export one from overview." : `last backup ${backupDays}d ago — export a fresh one.`}</span>
          <span class="mono">→</span>
        </div>
      `}

      <div class="tab-bar">
        ${TABS.map(
          (t) => html`
            <button class="tab-btn ${tab === t.id ? "active" : ""}" onClick=${() => setTab(t.id)}>
              <span class="tab-num">${t.n}</span>${t.label}
            </button>
          `
        )}
      </div>

      <div class="main">
        ${tab === "overview" && html`<${Overview} stats=${stats} dailyLogs=${dailyLogs} training=${training} freelance=${freelance} onBackup=${() => setBackupTick((t) => t + 1)} />`}
        ${tab === "daily" && html`<${DailyLog} logs=${dailyLogs} setLogs=${setDailyLogs} />`}
        ${tab === "heatmaps" && html`<${Heatmaps} dailyLogs=${dailyLogs} training=${training} />`}
        ${tab === "training" && html`<${Training} training=${training} setTraining=${setTraining} />`}
        ${tab === "academics" && html`<${Academics} logs=${dailyLogs} />`}
        ${tab === "freelance" && html`<${Freelance} freelance=${freelance} setFreelance=${setFreelance} />`}
        ${tab === "goals" && html`<${Goals} goals=${goals} setGoals=${setGoals} />`}
        ${tab === "issues" && html`<${IssuesEvents} data=${issuesEvents} setData=${setIssuesEvents} />`}
      </div>
    </div>
  `;
}

// ================= OVERVIEW =================
function Overview({ stats, dailyLogs, training, freelance, onBackup }) {
  const sleepData = dailyLogs.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-14);
  return html`
    <div class="grid">
      <${Card} title="sleep — last 14 nights">
        ${sleepData.length === 0
          ? html`<${Empty} text="log wake/bed times in the daily log tab to see this fill in." />`
          : html`<${SleepStockChart} data=${sleepData} />`}
      </${Card}>
      <${Card} title="upcoming">
        ${stats.upcomingEvents.length === 0
          ? html`<${Empty} text="no upcoming events logged." />`
          : html`
            <ul class="list">
              ${stats.upcomingEvents.map(
                (e) => html`<li class="list-item-row"><span class="mono">${fmtDate(e.date)}</span><span>${e.title}</span></li>`
              )}
            </ul>
          `}
      </${Card}>
      <div class="row">
        <${Card} title="freelance paid — this month">
          <div class="big-num">₹${stats.incomeMonth.toFixed(0)}</div>
          <div class="subtle">${freelance.length} projects total</div>
        </${Card}>
        <${Card} title="training volume">
          <div class="big-num">${stats.kmWeek.toFixed(1)} <span class="subtle">km / wk</span></div>
          <div class="subtle">${training.length} sessions total</div>
        </${Card}>
      </div>
      <${BackupCard} onBackup=${onBackup} />
    </div>
  `;
}

// ================= BACKUP (export / import) =================
function BackupCard({ onBackup }) {
  const [msg, setMsg] = useState("");

  const doExport = () => {
    const payload = {};
    Object.entries(KEYS).forEach(([name, key]) => {
      payload[name] = load(key, null);
    });
    payload._exportedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kaz-dashboard-backup-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    localStorage.setItem("kaz-dashboard-last-backup", new Date().toISOString());
    if (onBackup) onBackup();
    setMsg("backup downloaded.");
  };

  const doImport = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        Object.entries(KEYS).forEach(([name, key]) => {
          if (parsed[name] !== undefined && parsed[name] !== null) {
            save(key, parsed[name]);
          }
        });
        setMsg("restored — reloading...");
        setTimeout(() => window.location.reload(), 600);
      } catch (err) {
        setMsg("couldn't read that file — make sure it's a backup json exported from here.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return html`
    <${Card} title="backup">
      <div class="subtle" style="margin-bottom:10px;">
        data lives only on this device. export a backup now and then, and keep the file in drive/whatsapp-to-self so a phone change or a cleared browser doesn't wipe your logs.
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <button class="btn-primary" onClick=${doExport}>⭳ export backup</button>
        <label class="btn-primary" style="background:var(--surface); border:1px solid var(--border2); color:var(--text);">
          ⭱ import backup
          <input type="file" accept="application/json" style="display:none" onInput=${doImport} />
        </label>
      </div>
      ${msg && html`<div class="subtle" style="margin-top:8px;">${msg}</div>`}
    </${Card}>
  `;
}

// ================= DAILY LOG =================
function DailyLog({ logs, setLogs }) {
  const [form, setForm] = useState({
    date: today(), bedTime: "", wakeTime: "", sleepQuality: 6, studyHours: "",
    studyIntensity: 3, gymDone: false, gymIntensity: 3, mood: 6, notes: "",
  });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const yesterdayStr = (dateStr) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  const previewSleepHours = useMemo(() => {
    const yLog = logs.find((l) => l.date === yesterdayStr(form.date));
    if (yLog && yLog.bedTime && form.wakeTime) return computeSleepHours(yLog.bedTime, form.wakeTime);
    return null;
  }, [logs, form.date, form.wakeTime]);

  const add = () => {
    if (!form.date) return;
    const yLog = logs.find((l) => l.date === yesterdayStr(form.date));
    const sleepHours = yLog && yLog.bedTime && form.wakeTime ? computeSleepHours(yLog.bedTime, form.wakeTime) : "";
    const entry = { id: uid(), ...form, sleepHours, gymIntensity: form.gymDone ? form.gymIntensity : null };
    setLogs((prev) => [...prev.filter((l) => l.date !== form.date), entry]);
    setForm({
      date: today(), bedTime: "", wakeTime: "", sleepQuality: 6, studyHours: "",
      studyIntensity: 3, gymDone: false, gymIntensity: 3, mood: 6, notes: "",
    });
  };
  const sorted = logs.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  return html`
    <div>
      <${Card} title="add today's entry">
        <div class="form-grid">
          <${Field} label="date"><input type="date" class="input" value=${form.date} onInput=${upd("date")} /></${Field}>
          <div class="field"></div>
          <${Field} label="bed time (tonight)"><input type="time" class="input" value=${form.bedTime} onInput=${upd("bedTime")} /></${Field}>
          <${Field} label="wake time (this morning)"><input type="time" class="input" value=${form.wakeTime} onInput=${upd("wakeTime")} /></${Field}>
          <div class="field wide subtle" style="margin-top:-6px;">
            ${previewSleepHours != null
              ? html`auto-calculated: <span style="color:${previewSleepHours >= SLEEP_MIN_HOURS ? "#4F9D69" : "#C0455C"}; font-weight:700;">${previewSleepHours.toFixed(1)}h</span> (yesterday's bed time → today's wake time)`
              : "log yesterday's bed time + today's wake time to auto-calculate sleep hours."}
          </div>
          <${Field} label="sleep quality (${form.sleepQuality}/10)"><input type="range" min="1" max="10" class="slider" value=${form.sleepQuality} onInput=${(e) => setForm({ ...form, sleepQuality: Number(e.target.value) })} /></${Field}>
          <${Field} label="study hours"><input type="number" step="0.5" class="input" placeholder="4" value=${form.studyHours} onInput=${upd("studyHours")} /></${Field}>
          <${Field} label="study intensity (${form.studyIntensity}/5)"><input type="range" min="1" max="5" class="slider" value=${form.studyIntensity} onInput=${(e) => setForm({ ...form, studyIntensity: Number(e.target.value) })} /></${Field}>
          <${Field} label="mood (${form.mood}/10)"><input type="range" min="1" max="10" class="slider" value=${form.mood} onInput=${(e) => setForm({ ...form, mood: Number(e.target.value) })} /></${Field}>

          <div class="field wide">
            <div style="display:flex; align-items:center; gap:8px; cursor:pointer;" onClick=${() => setForm({ ...form, gymDone: !form.gymDone })}>
              <span class="checkbox ${form.gymDone ? "done" : ""}">${form.gymDone ? "✓" : ""}</span>
              <span>went to gym today</span>
            </div>
          </div>
          ${form.gymDone && html`
            <${Field} label="gym intensity (${form.gymIntensity}/5)" wide>
              <input type="range" min="1" max="5" class="slider" value=${form.gymIntensity} onInput=${(e) => setForm({ ...form, gymIntensity: Number(e.target.value) })} />
            </${Field}>
          `}

          <${Field} label="notes" wide><input class="input" placeholder="anything worth remembering" value=${form.notes} onInput=${upd("notes")} /></${Field}>
        </div>
        <button class="btn-primary" onClick=${add}>+ save entry</button>
      </${Card}>
      <${Card} title="log history">
        ${sorted.length === 0
          ? html`<${Empty} text="no entries yet." />`
          : html`
            <ul class="list">
              ${sorted.map(
                (l) => html`
                  <li class="list-item-row" key=${l.id}>
                    <div class="row-left">
                      <span class="mono">${fmtDate(l.date)}</span>
                      <span style="color:${l.sleepHours ? (l.sleepHours >= SLEEP_MIN_HOURS ? "#4F9D69" : "#C0455C") : "var(--muted)"}">${l.sleepHours ? Number(l.sleepHours).toFixed(1) : "—"}h sleep</span>
                      <span class="subtle">${l.studyHours || 0}h study</span>
                      <span class="subtle">study ${l.studyIntensity || "—"}/5</span>
                      <span class="subtle">${l.gymIntensity ? `gym ${l.gymIntensity}/5` : "rest day"}</span>
                      <span style="color:${qualityColor(l.mood)}">mood ${l.mood}/10</span>
                    </div>
                    <button class="icon-btn" onClick=${() => setLogs((p) => p.filter((x) => x.id !== l.id))}>✕</button>
                  </li>
                `
              )}
            </ul>
          `}
      </${Card}>
    </div>
  `;
}

// ================= TRAINING =================
function Training({ training, setTraining }) {
  const [form, setForm] = useState({ date: today(), type: "ride", distanceKm: "", durationMin: "", notes: "" });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = () => {
    if (!form.distanceKm) return;
    setTraining((prev) => [...prev, { id: uid(), ...form }]);
    setForm({ date: today(), type: "ride", distanceKm: "", durationMin: "", notes: "" });
  };
  const chartData = training.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-14)
    .map((t) => ({ date: fmtDate(t.date), distanceKm: t.distanceKm, type: t.type }));
  const sorted = training.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  return html`
    <div>
      <${Card} title="log a session">
        <div class="form-grid">
          <${Field} label="date"><input type="date" class="input" value=${form.date} onInput=${upd("date")} /></${Field}>
          <${Field} label="type">
            <select class="input" value=${form.type} onInput=${upd("type")}>
              <option value="ride">ride (kaz-a)</option>
              <option value="run">run</option>
            </select>
          </${Field}>
          <${Field} label="distance (km)"><input type="number" step="0.1" class="input" placeholder="13.18" value=${form.distanceKm} onInput=${upd("distanceKm")} /></${Field}>
          <${Field} label="duration (min)"><input type="number" class="input" placeholder="75" value=${form.durationMin} onInput=${upd("durationMin")} /></${Field}>
          <${Field} label="notes" wide><input class="input" placeholder="anshi ghat KOM attempt" value=${form.notes} onInput=${upd("notes")} /></${Field}>
        </div>
        <button class="btn-primary" onClick=${add}>+ save session</button>
      </${Card}>
      <${Card} title="volume — last 14 sessions">
        ${chartData.length === 0
          ? html`<${Empty} text="log a ride or run to see the chart." />`
          : html`<${BarChartSVG} data=${chartData} valueKey="distanceKm" colorFn=${(d) => (d.type === "ride" ? "#3B82C4" : "#C1552C")} />`}
      </${Card}>
      <${Card} title="session history">
        ${sorted.length === 0
          ? html`<${Empty} text="no sessions yet." />`
          : html`
            <ul class="list">
              ${sorted.map(
                (t) => html`
                  <li class="list-item-row" key=${t.id}>
                    <div class="row-left">
                      <span class="mono">${fmtDate(t.date)}</span>
                      <span style="color:${t.type === "ride" ? "#3B82C4" : "#C1552C"}">${t.type}</span>
                      <span>${t.distanceKm} km</span>
                      <span class="subtle">${t.durationMin || "—"} min</span>
                    </div>
                    <button class="icon-btn" onClick=${() => setTraining((p) => p.filter((x) => x.id !== t.id))}>✕</button>
                  </li>
                `
              )}
            </ul>
          `}
      </${Card}>
    </div>
  `;
}

// ================= HEATMAPS =================
function HeatmapSection({ weeks, valueMap, colorFn, unit }) {
  return html`
    <div class="heatmap-grid">
      ${weeks.map(
        (week, wi) => html`
          <div class="heatmap-col" key=${wi}>
            ${week.map((date) => {
              const v = valueMap[date];
              const bg = v ? colorFn(v) : null;
              const label = v ? `${date}: ${v}${unit || ""}` : `${date}: no data`;
              return html`<div class="heatmap-cell" title=${label} style=${bg ? `background:${bg}` : ""}></div>`;
            })}
          </div>
        `
      )}
    </div>
  `;
}

function Heatmaps({ dailyLogs, training }) {
  const weeks = useMemo(() => buildWeeks(84), []);

  const gymMap = {}, studyMap = {}, moodMap = {}, workoutMap = {};
  dailyLogs.forEach((l) => {
    if (l.gymIntensity) gymMap[l.date] = Number(l.gymIntensity);
    if (l.studyIntensity) studyMap[l.date] = Number(l.studyIntensity);
    if (l.mood) moodMap[l.date] = Number(l.mood);
  });
  training.forEach((t) => {
    workoutMap[t.date] = (workoutMap[t.date] || 0) + Number(t.distanceKm || 0);
  });

  return html`
    <div>
      <${Card} title="gym intensity — last 12 weeks">
        <${HeatmapSection}
          weeks=${weeks} valueMap=${gymMap} unit="/5"
          colorFn=${(v) => `rgba(59,130,196,${(0.25 + 0.75 * Math.min(1, v / 5)).toFixed(2)})`}
        />
      </${Card}>
      <${Card} title="workouts (km/day) — last 12 weeks">
        <${HeatmapSection}
          weeks=${weeks} valueMap=${workoutMap} unit="km"
          colorFn=${(v) => `rgba(193,85,44,${(0.25 + 0.75 * Math.min(1, v / 20)).toFixed(2)})`}
        />
      </${Card}>
      <${Card} title="study intensity — last 12 weeks">
        <${HeatmapSection}
          weeks=${weeks} valueMap=${studyMap} unit="/5"
          colorFn=${(v) => `rgba(79,157,105,${(0.25 + 0.75 * Math.min(1, v / 5)).toFixed(2)})`}
        />
      </${Card}>
      <${Card} title="mood — last 12 weeks">
        <${HeatmapSection} weeks=${weeks} valueMap=${moodMap} unit="/10" colorFn=${qualityColor} />
      </${Card}>
    </div>
  `;
}

// ================= ACADEMICS =================
function Academics({ logs }) {
  const chartData = logs.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-14)
    .map((l) => ({ date: fmtDate(l.date), studyHours: l.studyHours || 0 }));
  const totalWeek = logs.filter((l) => new Date(l.date) >= new Date(Date.now() - 7 * 864e5))
    .reduce((s, l) => s + Number(l.studyHours || 0), 0);

  return html`
    <div>
      <${Card} title="study hours — last 14 days">
        <div class="subtle" style="margin-bottom:8px;">pulled from daily log entries.</div>
        ${chartData.length === 0
          ? html`<${Empty} text="no study hours logged yet." />`
          : html`<${BarChartSVG} data=${chartData} valueKey="studyHours" colorFn=${() => "#3B82C4"} />`}
      </${Card}>
      <${Card} title="this week">
        <div class="big-num">${totalWeek.toFixed(1)}h <span class="subtle">studied</span></div>
      </${Card}>
    </div>
  `;
}

const STAGES = [
  { key: "start", label: "start", color: "#3B82C4" },
  { key: "ongoing", label: "ongoing", color: "#C1552C" },
  { key: "delivered", label: "delivered", color: "#8B5CF6" },
  { key: "paid", label: "paid", color: "#4F9D69" },
];

function StageBar({ status }) {
  const currentIdx = Math.max(0, STAGES.findIndex((s) => s.key === status));
  return html`
    <div>
      <div class="stage-bar">
        ${STAGES.map((s, i) => {
          const filled = i <= currentIdx;
          const style = filled
            ? `background:${s.color}; box-shadow:0 0 10px ${s.color}99;`
            : "";
          return html`<div class="stage-seg" key=${s.key} style=${style}></div>`;
        })}
      </div>
      <div class="stage-labels">
        ${STAGES.map(
          (s, i) => html`<span key=${s.key} style=${i === currentIdx ? `color:${s.color}; font-weight:700;` : ""}>${s.label}</span>`
        )}
      </div>
    </div>
  `;
}

// ================= FREELANCE =================
function Freelance({ freelance, setFreelance }) {
  const [form, setForm] = useState({ date: today(), project: "", client: "", amount: "" });
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const add = () => {
    if (!form.project) return;
    setFreelance((prev) => [...prev, { id: uid(), ...form, status: "start" }]);
    setForm({ date: today(), project: "", client: "", amount: "" });
  };

  const setStatus = (id, status) =>
    setFreelance((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
  const removeProject = (id) => setFreelance((prev) => prev.filter((f) => f.id !== id));

  const sorted = freelance.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalPaid = freelance.filter((f) => f.status === "paid").reduce((s, f) => s + Number(f.amount || 0), 0);
  const totalInProgress = freelance.filter((f) => f.status !== "paid").reduce((s, f) => s + Number(f.amount || 0), 0);
  const chartData = freelance.map((f) => ({ date: f.project.slice(0, 8), amount: f.amount, status: f.status }));

  return html`
    <div>
      <${Card} title="log a new project">
        <div class="form-grid">
          <${Field} label="date started"><input type="date" class="input" value=${form.date} onInput=${upd("date")} /></${Field}>
          <${Field} label="project"><input class="input" placeholder="photo upscale batch" value=${form.project} onInput=${upd("project")} /></${Field}>
          <${Field} label="client"><input class="input" placeholder="client name" value=${form.client} onInput=${upd("client")} /></${Field}>
          <${Field} label="amount (₹)"><input type="number" class="input" placeholder="2500" value=${form.amount} onInput=${upd("amount")} /></${Field}>
        </div>
        <button class="btn-primary" onClick=${add}>+ add project</button>
      </${Card}>

      <div class="row">
        <${Card} title="paid"><div class="big-num">₹${totalPaid.toFixed(0)}</div></${Card}>
        <${Card} title="in progress"><div class="big-num" style="color:#C1552C">₹${totalInProgress.toFixed(0)}</div></${Card}>
      </div>

      <${Card} title="value by project">
        ${chartData.length === 0
          ? html`<${Empty} text="add a project to see this fill in." />`
          : html`<${BarChartSVG} data=${chartData} valueKey="amount" colorFn=${(d) => STAGES.find((s) => s.key === d.status).color} />`}
      </${Card}>

      ${sorted.length === 0
        ? html`<${Card} title="projects"><${Empty} text="no projects logged yet." /></${Card}>`
        : sorted.map(
            (f) => html`
              <${Card} title=${f.project} key=${f.id}>
                <div class="row-left" style="margin-bottom:12px; justify-content:space-between; width:100%;">
                  <div class="row-left">
                    <span class="mono">${fmtDate(f.date)}</span>
                    <span class="subtle">${f.client}</span>
                    <span>₹${f.amount}</span>
                  </div>
                  <button class="icon-btn" onClick=${() => removeProject(f.id)}>✕</button>
                </div>
                <${StageBar} status=${f.status} />
                <div style="display:flex; gap:6px; margin-top:12px; flex-wrap:wrap;">
                  ${STAGES.map(
                    (s) => html`
                      <button
                        key=${s.key}
                        onClick=${() => setStatus(f.id, s.key)}
                        style="font-size:11px; padding:6px 10px; border-radius:6px; border:1px solid ${f.status === s.key ? s.color : "var(--border2)"}; background:${f.status === s.key ? s.color + "22" : "transparent"}; color:${f.status === s.key ? s.color : "var(--muted)"};"
                      >mark ${s.label}</button>
                    `
                  )}
                </div>
              </${Card}>
            `
          )}
    </div>
  `;
}

// ================= GOALS =================
function Goals({ goals, setGoals }) {
  const [drafts, setDrafts] = useState({});
  const addGoal = (tier) => {
    const text = (drafts[tier] || "").trim();
    if (!text) return;
    setGoals((prev) => ({ ...prev, [tier]: [...prev[tier], { id: uid(), text, done: false }] }));
    setDrafts((d) => ({ ...d, [tier]: "" }));
  };
  const toggle = (tier, id) =>
    setGoals((prev) => ({ ...prev, [tier]: prev[tier].map((g) => (g.id === id ? { ...g, done: !g.done } : g)) }));
  const remove = (tier, id) =>
    setGoals((prev) => ({ ...prev, [tier]: prev[tier].filter((g) => g.id !== id) }));

  return html`
    <div class="grid">
      ${GOAL_TIERS.map(
        (tier) => html`
          <${Card} title=${tier.label} key=${tier.key}>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
              <input
                class="input"
                style="flex:1"
                placeholder="add a ${tier.label} goal"
                value=${drafts[tier.key] || ""}
                onInput=${(e) => setDrafts((d) => ({ ...d, [tier.key]: e.target.value }))}
                onKeyDown=${(e) => e.key === "Enter" && addGoal(tier.key)}
              />
              <button class="icon-btn-big" onClick=${() => addGoal(tier.key)}>+</button>
            </div>
            ${goals[tier.key].length === 0
              ? html`<${Empty} text="nothing here yet." />`
              : html`
                <ul class="list">
                  ${goals[tier.key].map(
                    (g) => html`
                      <li class="list-item-row" key=${g.id}>
                        <div style="display:flex; gap:8px; align-items:center; cursor:pointer; flex:1" onClick=${() => toggle(tier.key, g.id)}>
                          <span class="checkbox ${g.done ? "done" : ""}">${g.done ? "✓" : ""}</span>
                          <span class="goal-text ${g.done ? "done" : ""}">${g.text}</span>
                        </div>
                        <button class="icon-btn" onClick=${() => remove(tier.key, g.id)}>✕</button>
                      </li>
                    `
                  )}
                </ul>
              `}
          </${Card}>
        `
      )}
    </div>
  `;
}

// ================= ISSUES + EVENTS =================
function IssuesEvents({ data, setData }) {
  const [issueDraft, setIssueDraft] = useState({ type: "immediate", text: "" });
  const [eventDraft, setEventDraft] = useState({ title: "", date: today(), notes: "" });

  const addIssue = () => {
    if (!issueDraft.text.trim()) return;
    setData((prev) => ({ ...prev, issues: [...prev.issues, { id: uid(), ...issueDraft, date: today(), resolved: false }] }));
    setIssueDraft({ type: "immediate", text: "" });
  };
  const toggleIssue = (id) =>
    setData((prev) => ({ ...prev, issues: prev.issues.map((i) => (i.id === id ? { ...i, resolved: !i.resolved } : i)) }));
  const removeIssue = (id) => setData((prev) => ({ ...prev, issues: prev.issues.filter((i) => i.id !== id) }));

  const addEvent = () => {
    if (!eventDraft.title.trim()) return;
    setData((prev) => ({ ...prev, events: [...prev.events, { id: uid(), ...eventDraft }] }));
    setEventDraft({ title: "", date: today(), notes: "" });
  };
  const removeEvent = (id) => setData((prev) => ({ ...prev, events: prev.events.filter((e) => e.id !== id) }));

  const immediate = data.issues.filter((i) => i.type === "immediate" && !i.resolved);
  const possible = data.issues.filter((i) => i.type === "possible" && !i.resolved);
  const resolved = data.issues.filter((i) => i.resolved);
  const sortedEvents = data.events.slice().sort((a, b) => new Date(a.date) - new Date(b.date));

  const IssueRow = (i, color) => html`
    <li class="list-item-row" key=${i.id}>
      <div style="display:flex; gap:8px; align-items:center; cursor:pointer; flex:1" onClick=${() => toggleIssue(i.id)}>
        <span class="dot" style="background:${color}"></span>
        <span class="goal-text ${i.resolved ? "done" : ""}">${i.text}</span>
      </div>
      <button class="icon-btn" onClick=${() => removeIssue(i.id)}>✕</button>
    </li>
  `;

  return html`
    <div class="grid">
      <${Card} title="log an issue">
        <div class="form-grid">
          <${Field} label="type">
            <select class="input" value=${issueDraft.type} onInput=${(e) => setIssueDraft({ ...issueDraft, type: e.target.value })}>
              <option value="immediate">immediate problem</option>
              <option value="possible">possible / future issue</option>
            </select>
          </${Field}>
          <${Field} label="description" wide>
            <input class="input" placeholder="what's the problem" value=${issueDraft.text} onInput=${(e) => setIssueDraft({ ...issueDraft, text: e.target.value })} />
          </${Field}>
        </div>
        <button class="btn-primary" onClick=${addIssue}>+ add issue</button>
      </${Card}>

      <${Card} title="immediate problems (${immediate.length})">
        ${immediate.length === 0 ? html`<${Empty} text="none open — good." />` : html`<ul class="list">${immediate.map((i) => IssueRow(i, "#C0455C"))}</ul>`}
      </${Card}>

      <${Card} title="possible / watch list (${possible.length})">
        ${possible.length === 0 ? html`<${Empty} text="nothing on the radar." />` : html`<ul class="list">${possible.map((i) => IssueRow(i, "#C1552C"))}</ul>`}
      </${Card}>

      ${resolved.length > 0 && html`
        <${Card} title="resolved (${resolved.length})">
          <ul class="list">${resolved.map((i) => IssueRow(i, "#4F9D69"))}</ul>
        </${Card}>
      `}

      <${Card} title="add an event / reminder">
        <div class="form-grid">
          <${Field} label="title"><input class="input" placeholder="exam, deadline, ride..." value=${eventDraft.title} onInput=${(e) => setEventDraft({ ...eventDraft, title: e.target.value })} /></${Field}>
          <${Field} label="date"><input type="date" class="input" value=${eventDraft.date} onInput=${(e) => setEventDraft({ ...eventDraft, date: e.target.value })} /></${Field}>
          <${Field} label="notes" wide><input class="input" placeholder="optional" value=${eventDraft.notes} onInput=${(e) => setEventDraft({ ...eventDraft, notes: e.target.value })} /></${Field}>
        </div>
        <button class="btn-primary" onClick=${addEvent}>+ add event</button>
      </${Card}>

      <${Card} title="events + reminders">
        ${sortedEvents.length === 0
          ? html`<${Empty} text="nothing scheduled." />`
          : html`
            <ul class="list">
              ${sortedEvents.map(
                (e) => html`
                  <li class="list-item-row" key=${e.id}>
                    <div class="row-left">
                      <span class="mono">${fmtDate(e.date)}</span>
                      <span>${e.title}</span>
                      ${e.notes && html`<span class="subtle">${e.notes}</span>`}
                    </div>
                    <button class="icon-btn" onClick=${() => removeEvent(e.id)}>✕</button>
                  </li>
                `
              )}
            </ul>
          `}
      </${Card}>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
