(function () {
  const LEVELS = [
    { k: "new", label: "มือใหม่", hint: "เพิ่งหัดตี" },
    { k: "BG", label: "BG", hint: "ตีโต้ได้ เริ่มเล่นเกม" },
    { k: "N", label: "N", hint: "เล่นเกมคล่อง" },
    { k: "S", label: "S", hint: "จริงจัง ลงแข่งได้" },
    { k: "P", label: "P", hint: "ระดับแข่งขัน" },
  ];
  const LV = Object.fromEntries(LEVELS.map((l) => [l.k, l]));
  const DATE_FILTERS = [["all", "ทั้งหมด"], ["today", "วันนี้"], ["tomorrow", "พรุ่งนี้"], ["weekend", "เสาร์–อาทิตย์"], ["week", "7 วันข้างหน้า"]];
  const POLL_MS = 5000;

  const S = {
    myId: null, ready: false, failed: false,
    games: [], joins: [], lastJson: "",
    open: new Set(), confirmDel: null, busy: new Set(),
    f: { date: "all", levels: new Set(), q: "", openOnly: false },
  };

  const $ = (id) => document.getElementById(id);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : String(c));
    }
    return el;
  }
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // ---------- วันที่ ----------
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = () => ymd(new Date());

  function dayLabel(s) {
    const full = parseYmd(s).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" });
    if (s === today()) return ["วันนี้", full];
    if (s === ymd(addDays(new Date(), 1))) return ["พรุ่งนี้", full];
    return [full, ""];
  }
  function matchDate(s) {
    const f = S.f.date, t = new Date();
    if (f === "today") return s === ymd(t);
    if (f === "tomorrow") return s === ymd(addDays(t, 1));
    if (f === "week") return s <= ymd(addDays(t, 7));
    if (f === "weekend") {
      const dow = t.getDay();
      const sat = dow === 0 ? addDays(t, -1) : addDays(t, 6 - dow);
      return s >= ymd(sat) && s <= ymd(addDays(sat, 1));
    }
    return true;
  }

  const joinsFor = (gid) => S.joins.filter((j) => j.gameId === gid).sort((a, b) => a.createdAt - b.createdAt);
  const nick = () => $("nick").value.trim();

  // ---------- เชื่อมต่อเซิร์ฟเวอร์ ----------
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    return data;
  }
  async function refresh() {
    try {
      const data = await api("GET", "/api/state");
      const json = JSON.stringify(data);
      if (S.failed) { S.failed = false; setStatus(""); }
      if (json === S.lastJson && S.ready) return;
      S.lastJson = json;
      S.games = data.games || [];
      S.joins = data.joins || [];
      S.ready = true;
      render();
    } catch {
      if (!S.failed) { S.failed = true; setStatus("ต่อเซิร์ฟเวอร์ไม่ได้ ตรวจว่ายังรัน node server.js อยู่"); }
      if (!S.ready) render();
    }
  }

  // ---------- ตัวกรอง ----------
  function buildChips() {
    const dc = $("dateChips");
    DATE_FILTERS.forEach(([k, l]) => dc.append(h("button", { class: "chip", type: "button", "data-k": k, "aria-pressed": String(S.f.date === k),
      onclick() { S.f.date = k; syncChips(); render(); } }, l)));
    const lc = $("levelChips");
    LEVELS.forEach((l) => lc.append(h("button", { class: "chip", type: "button", "data-k": l.k, "aria-pressed": "false", title: l.hint,
      onclick() { S.f.levels.has(l.k) ? S.f.levels.delete(l.k) : S.f.levels.add(l.k); syncChips(); render(); } }, l.label)));
    const fl = $("f-levels");
    LEVELS.forEach((l) => fl.append(h("button", { class: "chip", type: "button", "data-k": l.k, "aria-pressed": "false", title: l.hint,
      onclick(e) { const b = e.currentTarget; b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); } }, l.label)));
    const lg = $("legend");
    LEVELS.forEach((l) => lg.append(h("span", null, h("b", null, l.label), " ", l.hint)));
  }
  function syncChips() {
    document.querySelectorAll("#dateChips .chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === S.f.date)));
    document.querySelectorAll("#levelChips .chip").forEach((b) => b.setAttribute("aria-pressed", String(S.f.levels.has(b.dataset.k))));
  }

  // ---------- แสดงผล ----------
  function setStatus(msg) {
    const st = $("status");
    st.replaceChildren();
    if (msg) st.append(h("div", { class: "notice" }, msg));
  }

  function render() {
    const list = $("list");
    if (!S.ready) {
      list.replaceChildren(h("div", { class: "empty-state" }, h("b", null, S.failed ? "โหลดก๊วนไม่ได้" : "กำลังโหลดก๊วน…")));
      return;
    }
    const t = today(), q = S.f.q.toLowerCase();
    const games = S.games
      .filter((g) => g.date >= t)
      .filter((g) => matchDate(g.date))
      .filter((g) => !S.f.levels.size || (g.levels || []).some((k) => S.f.levels.has(k)))
      .filter((g) => !q || [g.venue, g.area, g.note].join(" ").toLowerCase().includes(q))
      .filter((g) => !S.f.openOnly || joinsFor(g.id).length < g.slots)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

    if (!games.length) {
      const anyUpcoming = S.games.some((g) => g.date >= t);
      list.replaceChildren(h("div", { class: "empty-state" },
        h("b", null, anyUpcoming ? "ไม่มีก๊วนตรงกับตัวกรอง" : "ยังไม่มีก๊วนที่เปิดรับ"),
        anyUpcoming ? "ลองเปลี่ยนวันหรือระดับมือดู" : "เป็นคนแรกที่ตั้งก๊วนได้เลย กดปุ่ม “+ ตั้งก๊วน” ด้านบน"));
      return;
    }
    const byDay = new Map();
    games.forEach((g) => { if (!byDay.has(g.date)) byDay.set(g.date, []); byDay.get(g.date).push(g); });
    const sections = [];
    for (const [day, gs] of byDay) {
      const [main, sub] = dayLabel(day);
      sections.push(h("section", { class: "day" },
        h("h2", null, main, sub ? h("small", null, sub) : null),
        h("div", { class: "games" }, gs.map(card))));
    }
    list.replaceChildren(...sections);
  }

  function card(g) {
    const js = joinsFor(g.id);
    const confirmed = js.slice(0, g.slots), reserve = js.slice(g.slots);
    const left = g.slots - confirmed.length;
    const mine = js.find((j) => j.userId === S.myId);
    const canDelete = g.sample || g.hostId === S.myId;
    const open = S.open.has(g.id);
    const busy = S.busy.has(g.id);
    const levels = (g.levels || []).filter((k) => LV[k]);
    const meta = [g.area, g.courts + " คอร์ท", g.price != null ? "฿" + g.price + "/คน" : null].filter(Boolean);
    const dots = Array.from({ length: g.slots }, (_, i) => h("span", { class: "dot" + (i < confirmed.length ? " on" : ""), "aria-hidden": "true" }));

    const head = h("button", { class: "game-head", type: "button", "aria-expanded": String(open),
      onclick() { open ? S.open.delete(g.id) : S.open.add(g.id); render(); } },
      h("div", { class: "when" }, h("b", null, g.start), g.end ? h("span", null, "ถึง " + g.end) : null),
      h("div", { class: "info" },
        h("h3", null, g.venue, g.sample ? [" ", h("span", { class: "tag-sample" }, "ตัวอย่าง")] : null),
        h("div", { class: "meta" }, meta.map((m) => h("span", null, m)),
          levels.length ? h("span", { class: "lv" }, levels.map((k) => h("i", { title: LV[k].hint }, LV[k].label))) : null),
        h("div", { class: "slots" }, h("div", { class: "dots" }, dots))),
      h("div", { class: "need" },
        left > 0 ? h("b", null, "ขาดอีก " + left) : h("b", { class: "full" }, "เต็มแล้ว"),
        h("small", null, confirmed.length + "/" + g.slots + " คน" + (reserve.length ? " · สำรอง " + reserve.length : "")))
    );
    const art = h("article", { class: "game" + (left <= 0 ? " is-full" : "") }, head);
    if (!open) return art;

    const rows = [];
    if (g.shuttle) rows.push(["ค่าลูก", g.shuttle]);
    if (g.hostName) rows.push(["คนตั้งก๊วน", g.hostName]);
    if (g.contact) rows.push(["ติดต่อ", h("span", { class: "copy" }, h("code", null, g.contact),
      h("button", { type: "button", onclick(e) { copy(g.contact, e.currentTarget); } }, "คัดลอก"))]);
    if (g.note) rows.push(["รายละเอียด", g.note]);

    const players = h("div", { class: "players" },
      h("h4", null, "คนที่เข้าร่วม"),
      js.length
        ? h("ol", null, js.map((j, i) => h("li", { class: (i >= g.slots ? "reserve " : "") + (j.userId === S.myId ? "me-p" : "") },
            j.name + (i >= g.slots ? " (สำรอง)" : "") + (j.userId === S.myId ? " · คุณ" : ""))))
        : h("div", { class: "empty" }, "ยังไม่มีใครเข้าร่วม"));

    const actions = h("div", { class: "actions" });
    if (mine) {
      actions.append(h("button", { class: "btn btn-ghost", type: "button", disabled: busy, onclick() { leave(g); } }, "ถอนตัว"));
    } else {
      actions.append(h("button", { class: "btn btn-court", type: "button", disabled: busy, onclick() { join(g); } }, left > 0 ? "เข้าร่วมก๊วนนี้" : "ลงชื่อสำรอง"));
      if (!nick()) actions.append(h("span", { class: "hint" }, "ใส่ชื่อเล่นด้านบนก่อนกดเข้าร่วม"));
    }
    if (canDelete) {
      if (S.confirmDel === g.id) {
        actions.append(
          h("button", { class: "btn btn-danger", type: "button", disabled: busy, onclick() { removeGame(g); } }, "ยืนยันลบก๊วน"),
          h("button", { class: "btn btn-ghost", type: "button", onclick() { S.confirmDel = null; render(); } }, "ไม่ลบ"));
      } else {
        actions.append(h("button", { class: "btn btn-danger", type: "button", onclick() { S.confirmDel = g.id; render(); } }, "ลบก๊วน"));
      }
    }
    art.append(h("div", { class: "detail" },
      rows.length ? h("dl", null, rows.map(([k, v]) => [h("dt", null, k), h("dd", null, v)])) : null,
      players, actions));
    return art;
  }

  function copy(text, btn) {
    const done = (ok) => { btn.textContent = ok ? "คัดลอกแล้ว" : "เลือกข้อความแล้ว"; setTimeout(() => { btn.textContent = "คัดลอก"; }, 1600); };
    const selectIt = () => {
      const r = document.createRange(); r.selectNodeContents(btn.previousSibling);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r); done(false);
    };
    try { navigator.clipboard.writeText(text).then(() => done(true), selectIt); } catch { selectIt(); }
  }

  // ---------- บันทึกข้อมูล ----------
  async function withBusy(gid, fn) {
    S.busy.add(gid); render();
    try { await fn(); setStatus(""); }
    catch (e) { setStatus(e.message); }
    finally { S.busy.delete(gid); await refresh(); render(); }
  }
  function join(g) {
    const name = nick();
    if (!name) { $("nick").focus(); setStatus("ใส่ชื่อเล่นของคุณก่อน คนในก๊วนจะได้รู้ว่าใครมา"); return; }
    store.set("bad.nick", name);
    withBusy(g.id, () => api("POST", `/api/games/${g.id}/join`, { userId: S.myId, name }));
  }
  function leave(g) {
    withBusy(g.id, () => api("DELETE", `/api/games/${g.id}/join`, { userId: S.myId }));
  }
  function removeGame(g) {
    withBusy(g.id, async () => {
      await api("DELETE", `/api/games/${g.id}`, { userId: S.myId });
      S.confirmDel = null; S.open.delete(g.id);
    });
  }

  // ---------- ฟอร์มตั้งก๊วน ----------
  $("openCreate").addEventListener("click", () => {
    const p = $("createPanel");
    p.hidden = false;
    $("f-date").min = today();
    if (!$("f-date").value) $("f-date").value = today();
    if (!$("f-host").value) $("f-host").value = nick();
    $("f-venue").focus();
    p.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
  $("cancelCreate").addEventListener("click", () => { $("createPanel").hidden = true; $("formErr").textContent = ""; });
  $("createForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = (id) => $(id).value.trim();
    const err = $("formErr");
    err.textContent = "";
    if (!v("f-venue")) return (err.textContent = "ใส่ชื่อสนามด้วย");
    if (!v("f-date") || v("f-date") < today()) return (err.textContent = "เลือกวันที่ตั้งแต่วันนี้เป็นต้นไป");
    if (!v("f-start")) return (err.textContent = "ใส่เวลาเริ่ม");
    if (!v("f-host")) return (err.textContent = "ใส่ชื่อคนตั้งก๊วน");

    const btn = $("submitBtn");
    btn.disabled = true; btn.textContent = "กำลังลงประกาศ…";
    try {
      const game = await api("POST", "/api/games", {
        venue: v("f-venue"), area: v("f-area"), date: v("f-date"), start: v("f-start"), end: v("f-end"),
        slots: v("f-slots"), courts: v("f-courts"), price: v("f-price"),
        shuttle: v("f-shuttle"), note: v("f-note"), contact: v("f-contact"),
        hostName: v("f-host"), hostId: S.myId,
        levels: [...document.querySelectorAll("#f-levels .chip[aria-pressed=true]")].map((b) => b.dataset.k),
      });
      if (!nick()) { $("nick").value = v("f-host"); store.set("bad.nick", v("f-host")); }
      ["f-venue", "f-area", "f-note", "f-shuttle", "f-price"].forEach((id) => ($(id).value = ""));
      document.querySelectorAll("#f-levels .chip").forEach((b) => b.setAttribute("aria-pressed", "false"));
      $("createPanel").hidden = true;
      S.open.add(game.id);
      setStatus("ลงประกาศแล้ว ก๊วนของคุณอยู่ในรายการด้านล่าง");
      await refresh();
    } catch (e2) {
      err.textContent = e2.message;
    } finally {
      btn.disabled = false; btn.textContent = "ลงประกาศ";
    }
  });

  // ---------- เริ่มทำงาน ----------
  let qTimer;
  $("q").addEventListener("input", (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.f.q = e.target.value.trim(); render(); }, 150); });
  $("openOnly").addEventListener("change", (e) => { S.f.openOnly = e.target.checked; render(); });
  $("nick").value = store.get("bad.nick") || "";
  $("nick").addEventListener("change", (e) => { store.set("bad.nick", e.target.value.trim()); render(); });

  S.myId = store.get("bad.userId");
  if (!S.myId) {
    S.myId = "u" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    store.set("bad.userId", S.myId);
  }

  buildChips();
  render();
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();
