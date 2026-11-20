// Cloudflare Worker «auksion-live» — ход торгов для Mini App (20.11).
// GET ?lot=<id> → ставки + таймер + участники/зрители с публичной страницы наблюдения e-auksion.
// Только эти два адреса сайта (не открытый прокси), только для приложения, ответ кэшируется на 3 с.
const ALLOW = ["https://dimas8444.github.io", "http://localhost:8765"];
const TTL = 3000;
const memo = new Map();   // lot -> {t, body}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOW.includes(origin) ? origin : ALLOW[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    const json = (body, status = 200) => new Response(body, {
      status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    const lot = new URL(req.url).searchParams.get("lot") || "";
    if (!/^\d{6,10}$/.test(lot)) return json('{"ok":false,"error":"lot"}', 400);

    const m = memo.get(lot);
    if (m && Date.now() - m.t < TTL) return json(m.body);

    const base = "https://e-auksion.uz/api/front/";
    const h = { "Accept": "application/json", "User-Agent": "Mozilla/5.0",
                "Referer": "https://e-auksion.uz/lot-game-view?lot_id=" + lot };
    let a = null, b = null, status = 0;
    try {
      const [ra, rb] = await Promise.all([
        fetch(base + "game-lot-info?lot=" + lot + "&current_page=1&per_page=30&lang=uz", { headers: h }),
        fetch(base + "game-lot-info/over-time?lot=" + lot + "&lang=uz", { headers: h }),
      ]);
      status = ra.status;
      try { a = await ra.json(); } catch (e) {}
      try { b = await rb.json(); } catch (e) {}
    } catch (e) {}

    const info = (a && a.info) || {};
    const body = JSON.stringify({
      ok: !!a, status, t: Date.now(),
      total: (a && a.totalRows) || 0,
      flows: ((a && a.flows) || []).map(f => ({ u: f.user_number, d: f.flow_date, a: f.flow_amount, auto: f.is_autobid })),
      next: info.current_stavka || null,        // следующая ставка (шаг)
      over: info.over_time || null,             // время окончания «20.11.2026 10:55:47»
      left: (b && b.diff) ?? info.diff_time ?? null,   // мс до конца
      players: info.user_gamer_cnt ?? null,
      orders: info.user_order_cnt ?? null,
      spectators: b && b.spectators,
    });
    if (a) {
      memo.set(lot, { t: Date.now(), body });
      if (memo.size > 300) memo.delete(memo.keys().next().value);
    }
    return json(body, a ? 200 : 502);
  },
};
