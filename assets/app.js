/* ============================================================
   UM GOLO · UM KM — lógica do painel
   - lê data/data.json (gerado pelo GitHub Action)
   - anima os contadores e barras de progresso
   - atualiza sozinho de X em X minutos
   ============================================================ */

const REFRESH_MS = 5 * 60 * 1000; // 5 min
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const nf = new Intl.NumberFormat("pt-PT");
const nf1 = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });

const $ = (sel, root = document) => root.querySelector(sel);

let currentData = null; // último data.json carregado (para o modal)

/* ---------- utilidades ---------- */

function formatDate(iso, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const opts = withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" };
  return d.toLocaleString("pt-PT", opts);
}

function relativeTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
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
      state.textContent = "EM BREVE";
    } else if (done) {
      state.textContent = "EM DIA";
      state.classList.add("ok");
    } else {
      state.textContent = "EM DÍVIDA";
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
      remLabel.textContent = " em falta";
    } else if (done) {
      remEl.textContent = "0 km";
      remLabel.textContent = " — completo ✓";
    } else {
      remEl.textContent = `${nf1.format(remaining)} km`;
      remLabel.textContent = " em falta";
    }
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
    Date.now() - new Date(data.generatedAt).getTime() < 90 * 60 * 1000;
  live.classList.toggle("is-off", !fresh && !data.isSample);
  live.querySelector("[data-live-label]").textContent =
    data.isSample ? "EXEMPLO" : fresh ? "AO VIVO" : "EM PAUSA";

  renderRunners(data);
  document.title = `${data.goals?.total ?? 0} golos · Um Golo · Um Km`;
}

/* ---------- modal: registo de corridas ---------- */

const modal = $("#modal");
let lastFocused = null;

function formatRunDate(date, i) {
  if (!date) return `Corrida ${i + 1}`;
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
    live.querySelector("[data-live-label]").textContent = "SEM DADOS";
  }
}

load();
setInterval(load, REFRESH_MS);
// recarrega quando a aba volta a ficar visível
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") load();
});
