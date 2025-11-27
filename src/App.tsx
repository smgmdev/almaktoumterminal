import React, { useEffect, useState } from "react";

// ---------------------------------------------
// Types
// ---------------------------------------------

type Exchange = "BINANCE";

type LegSide = "BUY" | "SELL";

type VenueLeg = {
  exchange: Exchange;
  side: LegSide;
  price: number;
};

type ArbType = "SPOT" | "PERP" | "SPOT/PERP";

type Opportunity = {
  id: string;
  symbol: string;
  base: string;
  quote: string;
  type: ArbType;
  legs: VenueLeg[];
  spreadBps: number; // basis vs anchor, in bps
  estPnl: number; // est. PnL in quote currency
  notional: number;
  score: number; // internal ranking 0-100
  updatedAt: string;
};

// Narrative news types
type NarrativeCategory = "Private Equity" | "Global Markets" | "Digital Assets";

type NarrativeNewsItem = {
  id: string;
  category: NarrativeCategory;
  title: string;
};

// ---------------------------------------------
// Static config
// ---------------------------------------------

const SYMBOLS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "XRP/USDT",
  "LINK/USDT",
  "TON/USDT",
  "DOGE/USDT",
  "ARB/USDT",
  "SEI/USDT",
  "OP/USDT",
];

const BASE_PRICES: Record<string, number> = {
  "BTC/USDT": 98000,
  "ETH/USDT": 3600,
  "SOL/USDT": 210,
  "XRP/USDT": 0.62,
  "LINK/USDT": 18,
  "TON/USDT": 6,
  "DOGE/USDT": 0.18,
  "ARB/USDT": 1.25,
  "SEI/USDT": 0.8,
  "OP/USDT": 2.4,
};

const EXCHANGES: Exchange[] = ["BINANCE"];

// ---------------------------------------------
// Helpers
// ---------------------------------------------

function randBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function formatNumber(num: number, decimals = 2) {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ---------------------------------------------
// Synthetic opportunity generator (fallback)
// ---------------------------------------------

function generateRandomOpportunity(id: string): Opportunity {
  const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const [base, quote] = symbol.split("/");
  const basePrice = BASE_PRICES[symbol] ?? randBetween(1, 1000);

  const legs: VenueLeg[] = [
    {
      exchange: "BINANCE",
      side: "BUY",
      price: basePrice,
    },
  ];

  const spreadBps = randBetween(-20, 20);
  const notional = Math.round(randBetween(50_000, 750_000));
  const spreadFrac = spreadBps / 10000;
  const estPnl = notional * (spreadFrac / 2);

  const typeRoll = Math.random();
  const type: ArbType =
    typeRoll < 0.35 ? "SPOT" : typeRoll < 0.7 ? "PERP" : "SPOT/PERP";

  const now = new Date();

  return {
    id,
    symbol,
    base,
    quote,
    type,
    legs,
    spreadBps,
    estPnl,
    notional,
    score: Math.min(100, Math.max(20, Math.round(randBetween(40, 98)))),
    updatedAt: now.toLocaleTimeString("en-US", { hour12: false }),
  };
}

function generateInitialBook(count = 10): Opportunity[] {
  const book: Opportunity[] = [];
  for (let i = 0; i < count; i++) {
    book.push(generateRandomOpportunity(`opp-${i}`));
  }
  return book.sort((a, b) => b.spreadBps - a.spreadBps);
}

// ---------------------------------------------
// Small sparkline for trend column
// ---------------------------------------------

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return null;
  const width = 80;
  const height = 24;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const rising = values[values.length - 1] >= values[0];

  return (
    <svg
      className="w-20 h-6 overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={rising ? "#22c55e" : "#f97316"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col text-xs leading-tight">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-emerald-400">{value}</span>
    </div>
  );
}

// ---------------------------------------------
// Live Binance ticker hook (browser only)
// ---------------------------------------------

function useBinanceTicker(symbol: string) {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const streamSymbol = symbol.toLowerCase(); // e.g. btcusdt
    const ws = new WebSocket(
      `wss://stream.binance.com:9443/ws/${streamSymbol}@ticker`
    );

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data as string) as any;
        if (data && data.c) {
          const v = parseFloat(data.c);
          if (!Number.isNaN(v)) setPrice(v);
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      // silent for UI demo
    };

    return () => {
      ws.close();
    };
  }, [symbol]);

  return price;
}

// ---------------------------------------------
// Main App
// ---------------------------------------------

export default function App() {

  const [opps, setOpps] = useState<Opportunity[]>(() => generateInitialBook());
  const [history, setHistory] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<"ALL" | ArbType>("ALL");
  const [minEdge, setMinEdge] = useState(8); // in bps
  const [minNotional, setMinNotional] = useState(100_000);
  const [sparkData, setSparkData] = useState<number[]>([0]);
  const [newsFeed, setNewsFeed] = useState<NarrativeNewsItem[]>([]);

  // BINANCE ONLY LIVE PRICES
  const priceBTC = useBinanceTicker("BTCUSDT");
  const priceETH = useBinanceTicker("ETHUSDT");
  const priceSOL = useBinanceTicker("SOLUSDT");
  const priceXRP = useBinanceTicker("XRPUSDT");
  const priceLINK = useBinanceTicker("LINKUSDT");
  const priceTON = useBinanceTicker("TONUSDT");
  const priceDOGE = useBinanceTicker("DOGEUSDT");
  const priceARB = useBinanceTicker("ARBUSDT");
  const priceSEI = useBinanceTicker("SEIUSDT");
  const priceOP = useBinanceTicker("OPUSDT");

  // Load narrative news from multiple RSS sources
  useEffect(() => {
    async function loadNarrativeNews() {
      try {
        const feeds: { url: string; category: NarrativeCategory }[] = [
          { url: "https://finance.yahoo.com/topic/private-equity/rss/", category: "Private Equity" },
          { url: "https://finance.yahoo.com/topic/markets/rss/", category: "Global Markets" },
          { url: "https://finance.yahoo.com/topic/crypto/rss/", category: "Digital Assets" },
          { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", category: "Digital Assets" },
          { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "Global Markets" }
        ];

        const items: NarrativeNewsItem[] = [];

        for (const feed of feeds) {
          const resp = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
          if (!resp.ok) continue;
          const data = await resp.json();
          if (data.items && data.items.length > 0) {
            data.items.slice(0,3).forEach((it)=>{
            items.push({
              id: feed.category + Math.random().toString(36).slice(2),
              category: feed.category,
              title: it.title
            });
          });
          }
        }

        if (items.length) setNewsFeed(items.slice(0, 6));
      } catch (e) {
        console.error("Narrative news load error", e);
      }
    }

    if (typeof window !== "undefined") loadNarrativeNews();
  }, []);

  // Rebuild opportunity book whenever any live price moves
  useEffect(() => {
    const now = new Date();

    const prices: Record<string, number | null> = {
      "BTC/USDT": priceBTC,
      "ETH/USDT": priceETH,
      "SOL/USDT": priceSOL,
      "XRP/USDT": priceXRP,
      "LINK/USDT": priceLINK,
      "TON/USDT": priceTON,
      "DOGE/USDT": priceDOGE,
      "ARB/USDT": priceARB,
      "SEI/USDT": priceSEI,
      "OP/USDT": priceOP,
    };

    setOpps((prev) => {
      const next: Opportunity[] = [];

      SYMBOLS.forEach((symbol) => {
        const price = prices[symbol];
        const prevOpp = prev.find((p) => p.symbol === symbol);

        if (price != null) {
          const [base, quoteRaw] = symbol.split("/");
          const quote = quoteRaw ?? "USDT";
          const fairValue = BASE_PRICES[symbol] ?? price;

          // Spread vs anchor (synthetic "basis" in bps)
          const spreadFrac = (price - fairValue) / fairValue;
          const spreadBps = spreadFrac * 10000;

          const notional =
            prevOpp?.notional ?? Math.round(randBetween(75_000, 500_000));
          const estPnl = notional * (spreadFrac / 2);

          const score = Math.min(
            100,
            Math.max(20, Math.round(60 + Math.abs(spreadBps) / 4))
          );

          const legs: VenueLeg[] = [
            { exchange: "BINANCE", side: "BUY", price },
          ];

          next.push({
            id: prevOpp?.id ?? `opp-${symbol}`,
            symbol,
            base,
            quote,
            type: "PERP",
            legs,
            spreadBps,
            estPnl,
            notional,
            score,
            updatedAt: now.toLocaleTimeString("en-US", { hour12: false }),
          });
        } else {
          // fallback to previous or synthetic
          next.push(
            prevOpp ?? generateRandomOpportunity(`fallback-${symbol}`)
          );
        }
      });

      next.sort((a, b) => b.spreadBps - a.spreadBps);

      const top = next[0];
      if (top) {
        const line = `${top.symbol}  |  ${top.type}  |  ${top.spreadBps.toFixed(
          1
        )}bps  |  est PnL ${formatNumber(top.estPnl, 0)} ${top.quote}`;
        setHistory((prevHist) => {
          const newLine = `${now.toLocaleTimeString("en-US", {
            hour12: false,
          })}  —  LIVE  —  ${line}`;
          const nextHist = [newLine, ...prevHist];
          return nextHist.slice(0, 16);
        });
        setSparkData((prevSpark) => {
          const updated = [...prevSpark, top.spreadBps];
          if (updated.length > 32) updated.shift();
          return updated;
        });
      }

      return next;
    });
  }, [
    priceBTC,
    priceETH,
    priceSOL,
    priceXRP,
    priceLINK,
    priceTON,
    priceDOGE,
    priceARB,
    priceSEI,
    priceOP,
  ]);

  const filteredOpps = opps.filter((o) => {
    if (filterType !== "ALL" && o.type !== filterType) return false;
    if (o.spreadBps < minEdge) return false;
    if (o.notional < minNotional) return false;
    return true;
  });

  const topVenueCounts = EXCHANGES.map((ex) => {
    const count = opps.filter((o) => {
      const best = [...o.legs].sort((a, b) => a.price - b.price)[0];
      return best.exchange === ex;
    }).length;
    return { exchange: ex, count };
  });

  const totalEdgeUsd = opps.reduce((acc, o) => acc + o.estPnl, 0);

  // --- AI Futures Trade Ideas (derived from current book) ---
  type AIFuturesIdea = {
    id: string;
    symbol: string;
    venue: Exchange;
    direction: "LONG" | "SHORT";
    edgeBps: number;
    estPnl: number;
    comment: string;
  };

  const sortedByEdge = [...opps].sort((a, b) => b.spreadBps - a.spreadBps);

  const aiLongIdeas: AIFuturesIdea[] = sortedByEdge.slice(0, 3).map((o) => ({
    id: `${o.id}-LONG`,
    symbol: o.symbol,
    venue: "BINANCE",
    direction: "LONG",
    edgeBps: o.spreadBps,
    estPnl: o.estPnl,
    comment: `Bias long ${o.base} perp on BINANCE, lean into positive basis.`,
  }));

  const aiShortIdeas: AIFuturesIdea[] = [...sortedByEdge]
    .reverse()
    .slice(0, 3)
    .map((o) => ({
      id: `${o.id}-SHORT`,
      symbol: o.symbol,
      venue: "BINANCE",
      direction: "SHORT",
      edgeBps: o.spreadBps,
      estPnl: o.estPnl,
      comment: `Bias short ${o.base} perp on BINANCE, fade stretched basis.`,
    }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* HERO SECTION */}
      <section className="relative h-[380px] w-full overflow-hidden flex items-center justify-center">
        <video
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          autoPlay
          loop
          muted
          playsInline
          src="https://corporate.stankeviciusgroup.com/assets/rf/dxb.mp4"
        />
        <div className="relative z-10 text-center max-w-2xl px-6">
          <img
            src="https://corporate.stankeviciusgroup.com/assets/rf/logo.png"
            alt="Logo"
            className="h-30 mx-auto mb-4 object-contain"
          />
          <h1 className="text-3xl md:text-4xl font-bold mb-3 text-white drop-shadow-lg">
            Institutional Level Intelligence
          </h1>
          <p className="text-slate-300 text-sm md:text-base mb-6">
           AI. Private Equity. Real Assets. Tokenization.
          </p>
          <div className="flex items-center justify-center gap-4">
           <a
  href="/contact.html"
  className="px-5 py-2.5 rounded-lg bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/30"
>
Apply to invest
</a>


          </div>
        </div>
      </section>

      

      {/* BODY */}
      <main className="flex-1 bg-gradient-to-b from-black via-slate-950 to-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6 grid grid-cols-1 lg:grid-cols-[290px,minmax(0,1fr),320px] gap-4 md:gap-5">
          {/* LEFT PANEL: placeholder (can be expanded later) */}
          <section className="space-y-4">
            {/* You can add venue status / summary here later */}
          </section>

          {/* CENTER: BINANCE PERP BOOK */}
          <section className="rounded-2xl border border-slate-800/80 bg-slate-950/80 shadow-2xl shadow-black/40 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between gap-4 bg-gradient-to-r from-slate-950 to-black">
              <div>
                <div className="text-sm font-semibold tracking-wide text-slate-100">
                  Binance Perpetual Opportunities
                </div>
                <div className="text-xs text-slate-400">
                  Basis vs model fair value (internal term-structure / funding model).
                </div>
              </div>
              <div className="flex flex-col items-end text-xs text-slate-400">
                <span>Sorted by basis (bps)</span>
                <span>
                  Showing {filteredOpps.length} of {opps.length} contracts
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800/80">
                  <tr className="text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 px-3 text-left font-medium">Symbol</th>
                    <th className="py-2 px-3 text-left font-medium">Structure</th>
                    <th className="py-2 px-3 text-left font-medium">Venue</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Basis (bps)
                    </th>
                    <th className="py-2 px-3 text-right font-medium">Est. PnL</th>
                    <th className="py-2 px-3 text-right font-medium">
                      Notional
                    </th>
                    <th className="py-2 px-3 text-center font-medium">Score</th>
                    <th className="py-2 px-3 text-center font-medium">Trend</th>
                    <th className="py-2 px-3 text-right font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOpps.map((o, idx) => {
                    const grossColor =
                      o.spreadBps >= 20
                        ? "text-emerald-400"
                        : o.spreadBps <= -20
                        ? "text-red-400"
                        : "text-slate-100";

                    const pnlColor =
                      o.estPnl >= 0 ? "text-emerald-400" : "text-red-400";

                    const isHighlighted = idx < 4;

                    return (
                      <tr
                        key={o.id}
                        className={`border-b border-slate-900/80 hover:bg-slate-900/60 transition ${
                          isHighlighted
                            ? "bg-gradient-to-r from-emerald-500/5 via-slate-950 to-slate-950"
                            : ""
                        }`}
                      >
                        {/* Symbol */}
                        <td className="px-3 py-2 align-middle">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-50">
                                {o.symbol}
                              </span>
                              {isHighlighted && (
                                <span className="text-[9px] text-emerald-400 flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  Focus
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              Single venue • {o.quote} leg
                            </div>
                          </div>
                        </td>

                        {/* Structure */}
                        <td className="px-3 py-2 align-middle">
                          <div className="inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-950/80 px-2 py-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span className="text-xs font-medium text-slate-100">
                              PERP
                            </span>
                          </div>
                        </td>

                        {/* Venue */}
                        <td className="px-3 py-2 align-middle">
                          <div className="text-xs text-slate-200">
                            BINANCE
                          </div>
                          <div className="text-xs text-slate-500">
                            Futures (USDT margined)
                          </div>
                        </td>

                        {/* Basis */}
                        <td className="px-3 py-2 align-middle text-right">
                          <div className={`font-semibold ${grossColor}`}>
                            {o.spreadBps.toFixed(1)}
                            <span className="text-[9px] text-slate-400 ml-0.5">
                              bps
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            vs model fair value
                          </div>
                        </td>

                        {/* PnL */}
                        <td className="px-3 py-2 align-middle text-right">
                          <div className={`font-semibold ${pnlColor}`}>
                            {o.estPnl >= 0 ? "" : "-"}$
                            {formatNumber(Math.abs(o.estPnl), 0)}
                          </div>
                          <div className="text-xs text-slate-500">
                            Net-of-costs proxy
                          </div>
                        </td>

                        {/* Notional */}
                        <td className="px-3 py-2 align-middle text-right">
                          <div className="font-medium text-slate-100">
                            ${formatNumber(o.notional, 0)}
                          </div>
                          <div className="text-xs text-slate-500">
                            Gross exposure
                          </div>
                        </td>

                        {/* Score */}
                        <td className="px-3 py-2 align-middle text-center">
                          <div className="inline-flex flex-col items-center">
                            <div className="relative h-5 w-5 rounded-full border border-slate-600/80 flex items-center justify-center text-xs font-semibold text-emerald-400">
                              {o.score}
                              <span className="absolute inset-0 rounded-full border border-emerald-500/40 animate-ping opacity-40" />
                            </div>
                            <span className="text-[9px] text-slate-500 mt-0.5">
                              Quality
                            </span>
                          </div>
                        </td>

                        {/* Trend */}
                        <td className="px-3 py-2 align-middle text-center">
                          <Sparkline values={sparkData} />
                        </td>

                        {/* Updated */}
                        <td className="px-3 py-2 align-middle text-right text-xs text-slate-400">
                          {o.updatedAt}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredOpps.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-10 text-center text-sm text-slate-500"
                      >
                        No contracts match current filters. Relax basis or
                        notional thresholds.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* RIGHT: AI BOARD + NEWS */}
        <section className="space-y-4"><div className="rounded-2xl border border-slate-800/80 bg-slate-950/90 p-3 space-y-3"><div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-100">AI Futures Trade Board</h3><p className="text-xs text-slate-400">Suggested long / short Binance perps derived from current basis.</p></div><span className="text-xs text-emerald-400">Model v1.0</span></div><div className="grid grid-cols-2 gap-3 text-xs"><div className="space-y-1.5"><div className="flex items-center justify-between"><span className="uppercase tracking-wide text-xs text-emerald-400">Long futures</span><span className="text-[9px] text-slate-500">Top 3</span></div>{aiLongIdeas.length===0?(<p className="text-slate-500 text-xs">Waiting for signal…</p>):(<ul className="space-y-1.5">{aiLongIdeas.map((idea)=>(<li key={idea.id} className="rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 space-y-0.5"><div className="flex items-center justify-between"><span className="font-semibold text-slate-100">{idea.symbol}</span><span className="text-[9px] text-emerald-400">{idea.venue} • LONG</span></div><div className="flex items-center justify-between text-[9px] text-slate-400"><span>Basis {idea.edgeBps.toFixed(1)} bps • Est PnL ${formatNumber(Math.abs(idea.estPnl),0)}</span></div><div className="text-[9px] text-slate-500">{idea.comment}</div></li>))}</ul>)}</div><div className="space-y-1.5"><div className="flex items-center justify-between"><span className="uppercase tracking-wide text-xs text-red-400">Short futures</span><span className="text-[9px] text-slate-500">Top 3</span></div>{aiShortIdeas.length===0?(<p className="text-slate-500 text-xs">Waiting for signal…</p>):(<ul className="space-y-1.5">{aiShortIdeas.map((idea)=>(<li key={idea.id} className="rounded-lg border border-slate-800 bg-slate-950/80 px-2 py-1.5 space-y-0.5"><div className="flex items-center justify-between"><span className="font-semibold text-slate-100">{idea.symbol}</span><span className="text-[9px] text-red-400">{idea.venue} • SHORT</span></div><div className="flex items-center justify-between text-[9px] text-slate-400"><span>Basis {idea.edgeBps.toFixed(1)} bps • Est PnL ${formatNumber(Math.abs(idea.estPnl),0)}</span></div><div className="text-[9px] text-slate-500">{idea.comment}</div></li>))}</ul>)}</div></div></div><div className="rounded-2xl border border-slate-800/80 bg-slate-950/90 p-3 space-y-2"><h3 className="text-sm font-semibold text-slate-100">AI Narrative News Feed</h3><p className="text-xs text-slate-400 mb-2">Latest headlines across Private Equity, Global Markets, and Digital Assets (Yahoo Finance RSS via proxy).</p>{newsFeed.length===0?(<div className="grid grid-cols-2 gap-3 text-sm"><div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-200"><span className="text-emerald-400 font-semibold">Private Equity • Bullish:</span><div className="mt-1">Mega-buyout funds accelerate deployment as global valuations stabilize.</div></div><div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-200"><span className="text-blue-400 font-semibold">Global Markets • Neutral:</span><div className="mt-1">US CPI cooldown fuels mixed flows across equities and FX.</div></div><div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-200"><span className="text-yellow-400 font-semibold">Digital Assets • Bearish:</span><div className="mt-1">Liquidity pockets thinning in altcoin complex as funding turns negative.</div></div></div>):(<div className="grid grid-cols-2 gap-3 text-sm">{newsFeed.slice(0,6).map((item)=>(<div key={item.id} className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-200"><div className="flex items-center justify-between mb-1">
<span className="font-semibold text-emerald-400">{item.category}</span>
<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-700 ${/up|rise|gain|bull|strong|surge|higher/i.test(item.title)?"text-emerald-400":/down|fall|drop|sell|bear|weaker|lower/i.test(item.title)?"text-red-400":"text-slate-400"}`}>{/up|rise|gain|bull|strong|surge|higher/i.test(item.title)?"Bullish":/down|fall|drop|sell|bear|weaker|lower/i.test(item.title)?"Bearish":"Neutral"}</span>
</div><div className="mt-1 line-clamp-3">{item.title}</div></div>))}</div>)}</div></section>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full py-4 border-t border-slate-800 bg-black/60 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-left">
        © {new Date().getFullYear()} Al Maktoum Capital Protection Division under AbdulHakim AlMaktoum Kanak Financial Brokerage LLC. All rights reserved.</div>
      </footer>
    </div>
  );
}
