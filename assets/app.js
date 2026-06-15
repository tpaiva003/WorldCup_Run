/* ============================================================
   UM GOLO · UM KM — lógica do painel
   - lê data/data.json (gerado pelo GitHub Action)
   - anima os contadores e barras de progresso
   - atualiza sozinho de X em X minutos
   ============================================================ */

const REFRESH_MS = 5 * 60 * 1000; // 5 min
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LOCALE = { pt: "pt-PT", en: "en-GB" };
let lang = localStorage.getItem("lang") === "en" ? "en" : "pt";
let nf = new Intl.NumberFormat(LOCALE[lang]);
let nf1 = new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 1 });

const $ = (sel, root = document) => root.querySelector(sel);

let currentData = null; // último data.json carregado (para o modal)

/* ---------- i18n (PT / EN) ---------- */

const I18N = {
  pt: {
    introEyebrow: "FIFA WORLD CUP 2026 · SAÚDE · DESAFIO",
    introTitle: "O Mundial marca golos.<br />Nós pagamos a correr.",
    introSub:
      "1 golo = 1 km. Estás a um clique de ver quem aguenta o ritmo do Mundial.",
    enter: "ENTRAR",
    introHint: "🔊 liga o som antes de entrar",
    heroEyebrow: "FIFA WORLD CUP 2026 — DESAFIO",
    heroTitle:
      'Por cada golo do Mundial,<br />corremos <span class="hl">1&nbsp;km</span>.',
    goalsUnit: "GOLOS",
    goalsSub: "= KM A CORRER, CADA UM",
    since: "desde o primeiro golo",
    photoSub: "EM PROVA · O DESAFIO COMEÇOU",
    lastUpdate: "ÚLT. ATUALIZAÇÃO",
    matches: "JOGOS",
    source: "FONTE",
    sample: "DADOS DE EXEMPLO",
    kmRun: "km corridos",
    goal: "meta",
    toGo: "em falta",
    done: "completo ✓",
    longestRun: "corrida + longa",
    runStreak: "dias seg. a correr",
    restStreak: "dias seg. sem correr",
    runLog: "REGISTO DE CORRIDAS",
    runsCount: "corridas",
    colDate: "DATA",
    colKm: "KM",
    noRuns: "Sem corridas registadas ainda.",
    music: "MÚSICA",
    playing: "A TOCAR",
    live: "AO VIVO",
    sampleTag: "EXEMPLO",
    paused: "EM PAUSA",
    noData: "SEM DADOS",
    stateSoon: "EM BREVE",
    stateOnTrack: "EM DIA",
    stateBehind: "EM DÍVIDA",
    justNow: "agora mesmo",
    minAgo: "há {n} min",
    hAgo: "há {n} h",
    run: "Corrida",
    goalsWord: "golos",
  },
  en: {
    introEyebrow: "FIFA WORLD CUP 2026 · HEALTH · CHALLENGE",
    introTitle: "The World Cup scores goals.<br />We pay in kilometres.",
    introSub:
      "1 goal = 1 km. You're one click from seeing who keeps up with the World Cup.",
    enter: "ENTER",
    introHint: "🔊 turn your sound on before entering",
    heroEyebrow: "FIFA WORLD CUP 2026 — CHALLENGE",
    heroTitle:
      'For every World Cup goal,<br />we run <span class="hl">1&nbsp;km</span>.',
    goalsUnit: "GOALS",
    goalsSub: "= KM TO RUN, EACH",
    since: "since the first goal",
    photoSub: "IN THE RACE · THE CHALLENGE IS ON",
    lastUpdate: "LAST UPDATE",
    matches: "MATCHES",
    source: "SOURCE",
    sample: "SAMPLE DATA",
    kmRun: "km run",
    goal: "goal",
    toGo: "to go",
    done: "done ✓",
    longestRun: "longest run",
    runStreak: "days running in a row",
    restStreak: "days without running",
    runLog: "RUN LOG",
    runsCount: "runs",
    colDate: "DATE",
    colKm: "KM",
    noRuns: "No runs logged yet.",
    music: "MUSIC",
    playing: "PLAYING",
    live: "LIVE",
    sampleTag: "SAMPLE",
    paused: "PAUSED",
    noData: "NO DATA",
    stateSoon: "SOON",
    stateOnTrack: "ON TRACK",
    stateBehind: "BEHIND",
    justNow: "just now",
    minAgo: "{n} min ago",
    hAgo: "{n} h ago",
    run: "Run",
    goalsWord: "goals",
  },
};

function t(key) {
  return (I18N[lang] && I18N[lang][key]) || I18N.pt[key] || key;
}

function applyStaticI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll(".lang-opt").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.lang === lang);
  });
}

function setLang(l) {
  if (l !== "pt" && l !== "en") return;
  lang = l;
  localStorage.setItem("lang", l);
  nf = new Intl.NumberFormat(LOCALE[lang]);
  nf1 = new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 1 });
  if (currentData) render(currentData);
  else applyStaticI18n();
  if (typeof anthem !== "undefined" && anthem) {
    setMusicPlayingUI(!anthem.paused);
  }
}

document.querySelectorAll(".lang-opt").forEach((b) => {
  b.addEventListener("click", () => setLang(b.dataset.lang));
});
applyStaticI18n(); // aplica logo (intro/hero, antes de os dados chegarem)

/* ---------- utilidades ---------- */

function formatDate(iso, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const opts = withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" };
  return d.toLocaleString(LOCALE[lang], opts);
}

function relativeTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const min = Math.round(diff / 60000);
  if (min < 1) return t("justNow");
  if (min < 60) return t("minAgo").replace("{n}", min);
  const h = Math.round(min / 60);
  if (h < 24) return t("hAgo").replace("{n}", h);
  return formatDate(iso);
}

// Anima um número de `from` até `to`. `decimals` controla as casas.
function animateNumber(el, to, { decimals = 0, duration = 1200 } = {}) {
  const from = parseFloat(el.dataset.count || "0") || 0;
  el.dataset.count = String(to);
  const fmt = decimals ? nf1 : nf;
  if (REDUCED || from === to) {
    el.textContent = fmt.format(to);
    return;
  }
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    const val = from + (to - from) * eased;
    el.textContent = fmt.format(decimals ? val : Math.round(val));
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmt.format(to);
  };
  requestAnimationFrame(tick);
}

/* ---------- render ---------- */

function renderRunners(data) {
  const wrap = $("#runners");
  const tpl = $("#runnerTpl");
  const goals = data.goals?.total ?? 0;

  // quem corre mais conta como líder (entre os que têm dados)
  const withKm = data.runners.filter((r) => typeof r.km === "number");
  const leaderId =
    withKm.length > 1
      ? withKm.reduce((a, b) => (b.km > a.km ? b : a)).id
      : null;

  // reusa cartões já existentes para animar em vez de recriar
  const existing = new Map(
    [...wrap.children].map((el) => [el.dataset.id, el])
  );

  data.runners.forEach((r) => {
    let card = existing.get(r.id);
    if (!card) {
      card = tpl.content.firstElementChild.cloneNode(true);
      card.dataset.id = r.id;
      wrap.appendChild(card);
    }
    existing.delete(r.id);

    const required = r.required ?? goals;
    const pending = typeof r.km !== "number";
    const remaining = pending ? null : Math.max(0, required - r.km);
    const done = !pending && remaining === 0 && required > 0;

    card.classList.toggle("is-pending", pending);
    card.classList.toggle("is-done", done);
    card.classList.toggle("is-leader", r.id === leaderId && !pending);

    $(".runner-name", card).textContent = r.name;

    const state = $(".runner-state", card);
    state.classList.remove("ok", "debt");
    if (pending) {
      state.textContent = t("stateSoon");
    } else if (done) {
      state.textContent = t("stateOnTrack");
      state.classList.add("ok");
    } else {
      state.textContent = t("stateBehind");
      state.classList.add("debt");
    }

    const kmNum = $(".km-num", card);
    if (pending) {
      kmNum.textContent = "—";
      kmNum.dataset.count = "0";
    } else {
      animateNumber(kmNum, r.km, { decimals: 1 });
    }

    const pct = required > 0 && !pending ? Math.min(1, r.km / required) : 0;
    const fill = $(".progress-fill", card);
    requestAnimationFrame(() => {
      fill.style.width = (pct * 100).toFixed(1) + "%";
    });
    fill.classList.toggle("over", !pending && r.km >= required && required > 0);
    $(".progress", card).setAttribute(
      "aria-valuenow",
      Math.round(pct * 100)
    );

    $(".meta-required", card).textContent = required
      ? `${nf.format(required)} km`
      : "—";
    const remEl = $(".meta-remaining", card);
    const remLabel = $(".meta-remaining-wrap", card).lastChild; // nó de texto
    if (pending) {
      remEl.textContent = "—";
      remLabel.textContent = " " + t("toGo");
    } else if (done) {
      remEl.textContent = "0 km";
      remLabel.textContent = " — " + t("done");
    } else {
      remEl.textContent = `${nf1.format(remaining)} km`;
      remLabel.textContent = " " + t("toGo");
    }

    // estatísticas
    const stats = r.stats || {};
    $(".stat-longest", card).textContent = pending
      ? "—"
      : `${nf1.format(stats.longestRun || 0)} km`;
    $(".stat-runstreak", card).textContent = pending
      ? "—"
      : nf.format(stats.runStreak || 0);
    $(".stat-reststreak", card).textContent = pending
      ? "—"
      : nf.format(stats.restStreak || 0);
  });

  // remove cartões que já não existam na config
  existing.forEach((el) => el.remove());
}

function render(data) {
  currentData = data;
  animateNumber($("#goals"), data.goals?.total ?? 0, { decimals: 0 });
  $("#firstGoal").textContent = data.goals?.firstGoalDate
    ? formatDate(data.goals.firstGoalDate, true)
    : "—";
  $("#updated").textContent = relativeTime(data.generatedAt);
  $("#updated").title = formatDate(data.generatedAt, true);
  $("#matches").textContent = nf.format(data.goals?.matchesPlayed ?? 0);

  const sample = $("#sampleTag");
  sample.hidden = !data.isSample;

  const live = $("#liveTag");
  const fresh =
    data.generatedAt &&
    Date.now() - new Date(data.generatedAt).getTime() < 150 * 60 * 1000;
  live.classList.toggle("is-off", !fresh && !data.isSample);
  live.querySelector("[data-live-label]").textContent = data.isSample
    ? t("sampleTag")
    : fresh
    ? t("live")
    : t("paused");

  renderRunners(data);
  applyStaticI18n();
  document.title = `${data.goals?.total ?? 0} ${t("goalsWord")} · Um Golo · Um Km`;
}

/* ---------- modal: registo de corridas ---------- */

const modal = $("#modal");
let lastFocused = null;

function formatRunDate(date, i) {
  if (!date) return `${t("run")} ${i + 1}`;
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(date)) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  }
  return date; // mostra tal como está na folha (ex.: 11/06/2026)
}

function openModal(id) {
  const r = (currentData?.runners ?? []).find((x) => x.id === id);
  if (!r) return;
  const runs = Array.isArray(r.runs) ? r.runs : [];

  $("#modalName").textContent = r.name;
  $("#modalKm").textContent = typeof r.km === "number" ? nf1.format(r.km) : "—";
  $("#modalRuns").textContent = nf.format(runs.length);

  const body = $("#runsBody");
  body.replaceChildren();
  runs.forEach((run, i) => {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    td1.textContent = formatRunDate(run.date, i);
    const td2 = document.createElement("td");
    td2.className = "runs-km-col";
    td2.textContent = `${nf1.format(run.km)} km`;
    tr.append(td1, td2);
    body.appendChild(tr);
  });
  $("#runsEmpty").hidden = runs.length > 0;
  $(".runs-table").hidden = runs.length === 0;

  lastFocused = document.activeElement;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => modal.classList.add("is-open"));
  $(".modal-close").focus();
}

function closeModal() {
  modal.classList.remove("is-open");
  document.body.style.overflow = "";
  setTimeout(() => (modal.hidden = true), REDUCED ? 0 : 260);
  if (lastFocused && typeof lastFocused.focus === "function") {
    lastFocused.focus();
  }
}

$("#runners").addEventListener("click", (e) => {
  const btn = e.target.closest(".runner-name");
  if (!btn) return;
  const card = btn.closest(".runner");
  if (card) openModal(card.dataset.id);
});
modal.addEventListener("click", (e) => {
  if (e.target.hasAttribute("data-close")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeModal();
});

/* ---------- imagens opcionais ---------- */
// Esconde a foto / logótipo enquanto os ficheiros não existirem em assets/,
// para nunca aparecer um ícone de imagem partida.
function hideOptionalImage(img) {
  const fig = img.closest(".photo");
  if (fig) fig.style.display = "none";
  else img.style.display = "none";
}
document.querySelectorAll("img[data-optional]").forEach((img) => {
  img.addEventListener("error", () => hideOptionalImage(img));
  if (img.complete && img.naturalWidth === 0) hideOptionalImage(img);
});

/* ---------- música (ficheiro próprio + arranque ao 1.º gesto) ---------- */
// Nenhum browser deixa tocar som ANTES de o utilizador interagir, por isso
// arrancamos no primeiro gesto (clique/tecla/toque) — o mais perto de autoplay.

const anthem = $("#anthem");
const musicBtn = $("#musicToggle");
let musicAutostarted = false;

function setMusicPlayingUI(playing) {
  if (!musicBtn) return;
  musicBtn.classList.toggle("is-playing", playing);
  musicBtn.setAttribute("aria-pressed", String(playing));
  const lbl = musicBtn.querySelector(".sound-label");
  if (lbl) lbl.textContent = playing ? t("playing") : t("music");
}

function playAnthem() {
  if (anthem) anthem.play().catch(() => {});
}

if (anthem) {
  anthem.volume = 0.6;
  anthem.addEventListener("play", () => setMusicPlayingUI(true));
  anthem.addEventListener("pause", () => setMusicPlayingUI(false));
}

function musicFirstGesture(ev) {
  if (musicAutostarted) return;
  if (ev && ev.target && ev.target.closest && ev.target.closest("#musicToggle")) {
    return; // o próprio botão trata do arranque
  }
  musicAutostarted = true;
  ["pointerdown", "keydown", "touchstart"].forEach((t) =>
    window.removeEventListener(t, musicFirstGesture)
  );
  playAnthem();
}
["pointerdown", "keydown", "touchstart"].forEach((t) =>
  window.addEventListener(t, musicFirstGesture, { passive: true })
);

if (musicBtn && anthem) {
  musicBtn.addEventListener("click", () => {
    musicAutostarted = true;
    if (anthem.paused) playAnthem();
    else anthem.pause();
  });
}

/* ---------- ecrã de entrada (capta o 1.º gesto e arranca a música) ---------- */
const intro = $("#intro");
const introEnter = $("#introEnter");

function enterSite() {
  if (!intro || intro.classList.contains("is-hidden")) return;
  musicAutostarted = true;
  playAnthem(); // o clique conta como gesto -> o browser deixa tocar

  // A taça voa do ecrã de entrada para o logótipo da barra de topo.
  const trophy = $("#introTrophy");
  const dest = document.querySelector(".brand-logo");
  let flying = false;
  if (trophy && dest && !REDUCED) {
    const r1 = trophy.getBoundingClientRect();
    const r2 = dest.getBoundingClientRect();
    if (r1.height && r2.height) {
      const scale = r2.height / r1.height;
      const dx = r2.left + r2.width / 2 - (r1.left + r1.width / 2);
      const dy = r2.top + r2.height / 2 - (r1.top + r1.height / 2);
      dest.style.opacity = "0"; // esconde o logótipo real durante o voo
      trophy.style.transition = "transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)";
      void trophy.offsetWidth; // força reflow antes de animar
      trophy.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
      intro.classList.add("is-leaving");
      flying = true;
    }
  }

  const finish = () => {
    intro.classList.add("is-hidden");
    if (dest) dest.style.opacity = "";
  };
  if (flying) setTimeout(finish, 950);
  else intro.classList.add("is-hidden");
}

if (intro) {
  intro.addEventListener("click", enterSite);
  document.addEventListener("keydown", (e) => {
    if (
      !intro.classList.contains("is-hidden") &&
      (e.key === "Enter" || e.key === " ")
    ) {
      e.preventDefault();
      enterSite();
    }
  });
  if (introEnter) {
    try {
      introEnter.focus({ preventScroll: true });
    } catch (_) {
      introEnter.focus();
    }
  }
}

/* ---------- carregamento ---------- */

async function load() {
  try {
    const res = await fetch("data/data.json?t=" + Date.now(), {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    render(await res.json());
  } catch (e) {
    console.error("Falha ao carregar os dados:", e);
    const live = $("#liveTag");
    live.classList.add("is-off");
    live.querySelector("[data-live-label]").textContent = t("noData");
  }
}

load();
setInterval(load, REFRESH_MS);
// recarrega quando a aba volta a ficar visível
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") load();
});
