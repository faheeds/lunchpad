"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

export type ModifyMenuItem = {
  id: string;
  name: string;
  basePriceCents: number;
  sizes: { name: string; priceCents: number }[];
  requiredChoices: string[];
  addOns: { name: string; priceDeltaCents: number }[];
  removals: string[];
};

export type ModifyLine = {
  id: string;
  menuItemId: string;
  name: string;
  sizeName: string | null;
  basePriceCents: number;
  /** Stored additions, including any required choice. */
  additions: string[];
  removals: string[];
  refunded: boolean;
  menu: ModifyMenuItem;
};

export type ModifyPayload = {
  updates: { orderItemId: string; additions: string[]; removals: string[] }[];
  removeItemIds: string[];
  adds: {
    menuItemId: string;
    size?: string;
    choice?: string;
    additions: string[];
    removals: string[];
    quantity: number;
  }[];
  adminNote?: string;
  adjustment: "stripe_link" | "manual" | "comped";
  manualMethod?: string;
  emailLink: boolean;
};

export type ModifyEdit = Pick<ModifyPayload, "updates" | "removeItemIds" | "adds">;

export type WeekPayload = {
  edits: (ModifyEdit & { orderId: string })[];
  adminNote?: string;
  adjustment: ModifyPayload["adjustment"];
  manualMethod?: string;
  emailLink: boolean;
};

type Result = { success: boolean; error?: string; message?: string; checkoutUrl?: string; emailed?: boolean };

type LineState = { remove: boolean; additions: string[]; removals: string[] };
type NewLine = {
  key: number;
  menuItemId: string;
  size?: string;
  choice?: string;
  additions: string[];
  removals: string[];
  quantity: number;
};

const field =
  "w-full rounded-lg border border-editorial-line text-sm px-3 py-2 bg-white focus:border-editorial-green focus:ring-1 focus:ring-editorial-green";
const chip = (on: boolean) =>
  `px-2.5 py-1 rounded-full text-[11px] border cursor-pointer ${on ? "bg-editorial-green text-white border-editorial-green" : "bg-white text-editorial-ink border-editorial-line"}`;

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);


export type EditorOutput = {
  edit: ModifyEdit;
  currentTotalCents: number;
  newTotalCents: number;
  dirty: boolean;
  remaining: number;
};

export type EditorOrder = {
  orderId: string;
  title?: string;
  currentTotalCents: number;
  discountCents: number;
  lines: ModifyLine[];
  menuItems: ModifyMenuItem[];
};

export function OrderEditor({ order, onChange }: { order: EditorOrder; onChange: (o: EditorOutput) => void }) {
  const { lines, menuItems } = order;
  const [state, setState] = useState<Record<string, LineState>>({});
  const [news, setNews] = useState<NewLine[]>([]);
  const [draftItem, setDraftItem] = useState("");
  const menuById = useMemo(() => new Map(menuItems.map((m) => [m.id, m])), [menuItems]);

  const lineState = (l: ModifyLine): LineState => {
    const addOnNames = new Set(l.menu.addOns.map((a) => a.name));
    return state[l.id] ?? { remove: false, additions: l.additions.filter((a) => addOnNames.has(a)), removals: l.removals };
  };
  const patchLine = (l: ModifyLine, p: Partial<LineState>) => setState((s) => ({ ...s, [l.id]: { ...lineState(l), ...p } }));

  function newLinePrice(n: NewLine) {
    const m = menuById.get(n.menuItemId);
    if (!m) return 0;
    const base = m.sizes.length ? (m.sizes.find((s) => s.name === n.size)?.priceCents ?? 0) : m.basePriceCents;
    return base + m.addOns.filter((a) => n.additions.includes(a.name)).reduce((t, a) => t + a.priceDeltaCents, 0);
  }

  const output = useMemo<EditorOutput>(() => {
    let subtotal = 0;
    for (const l of lines) {
      const st = state[l.id];
      if (st?.remove) continue;
      const adds = st ? st.additions : l.additions;
      subtotal += l.basePriceCents + l.menu.addOns.filter((a) => adds.includes(a.name)).reduce((t, a) => t + a.priceDeltaCents, 0);
    }
    for (const n of news) subtotal += newLinePrice(n) * n.quantity;
    return {
      edit: {
        updates: lines.filter((l) => state[l.id] && !state[l.id].remove).map((l) => ({ orderItemId: l.id, additions: state[l.id].additions, removals: state[l.id].removals })),
        removeItemIds: lines.filter((l) => state[l.id]?.remove).map((l) => l.id),
        adds: news.map((n) => ({ menuItemId: n.menuItemId, size: n.size, choice: n.choice, additions: n.additions, removals: n.removals, quantity: n.quantity })),
      },
      currentTotalCents: order.currentTotalCents,
      newTotalCents: Math.max(0, subtotal - order.discountCents),
      dirty: Object.keys(state).length > 0 || news.length > 0,
      remaining: lines.filter((l) => !state[l.id]?.remove).length + news.reduce((t, n) => t + n.quantity, 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, state, news, order.discountCents, order.currentTotalCents]);

  useEffect(() => {
    onChange(output);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output]);

  function addNew(menuItemId: string, seed?: Partial<NewLine>) {
    const m = menuById.get(menuItemId);
    if (!m) return;
    setNews((cur) => [...cur, { key: Date.now() + cur.length, menuItemId, size: m.sizes[0]?.name, choice: undefined, additions: [], removals: [], quantity: 1, ...seed }]);
  }

  function addAnother(l: ModifyLine) {
    const st = lineState(l);
    const addOnNames = new Set(l.menu.addOns.map((a) => a.name));
    addNew(l.menuItemId, {
      size: l.sizeName ?? undefined,
      choice: l.additions.find((a) => !addOnNames.has(a) && l.menu.requiredChoices.includes(a)),
      additions: st.additions,
      removals: st.removals,
    });
  }

  const patchNew = (key: number, p: Partial<NewLine>) => setNews((cur) => cur.map((n) => (n.key === key ? { ...n, ...p } : n)));
  const draft = menuById.get(draftItem);

  return (
    <div className="space-y-2">
      {order.title && <p className="text-[12px] font-semibold text-editorial-ink-soft uppercase tracking-wide">{order.title}</p>}
        {lines.map((l) => {
          const st = lineState(l);
          return (
            <div key={l.id} className={`rounded-lg border border-editorial-line p-2.5 space-y-2 ${st.remove ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-semibold text-editorial-ink">
                  {l.name}
                  {l.sizeName ? ` (${l.sizeName})` : ""}
                </p>
                <div className="flex gap-2 text-[11px] shrink-0">
                  {!l.refunded && (
                    <>
                      <button type="button" className="underline cursor-pointer" onClick={() => addAnother(l)}>
                        + another
                      </button>
                      <button type="button" className="underline text-red-700 cursor-pointer" onClick={() => patchLine(l, { remove: !st.remove })}>
                        {st.remove ? "Undo" : "Remove"}
                      </button>
                    </>
                  )}
                  {l.refunded && <span className="text-editorial-ink-soft">refunded</span>}
                </div>
              </div>
              {!st.remove && !l.refunded && (l.menu.addOns.length > 0 || l.menu.removals.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {l.menu.addOns.map((a) => (
                    <button key={a.name} type="button" className={chip(st.additions.includes(a.name))} onClick={() => patchLine(l, { additions: toggle(st.additions, a.name) })}>
                      + {a.name}
                      {a.priceDeltaCents ? ` ${formatCurrency(a.priceDeltaCents)}` : ""}
                    </button>
                  ))}
                  {l.menu.removals.map((r) => (
                    <button key={r} type="button" className={chip(st.removals.includes(r))} onClick={() => patchLine(l, { removals: toggle(st.removals, r) })}>
                      no {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {news.map((n) => {
          const m = menuById.get(n.menuItemId)!;
          return (
            <div key={n.key} className="rounded-lg border border-editorial-green p-2.5 space-y-2 bg-editorial-paper">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-semibold text-editorial-ink">
                  New: {m.name} · {formatCurrency(newLinePrice(n))} each
                </p>
                <button type="button" className="text-[11px] underline text-red-700 cursor-pointer" onClick={() => setNews((c) => c.filter((x) => x.key !== n.key))}>
                  Discard
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {m.sizes.length > 0 && (
                  <select className="rounded-lg border border-editorial-line text-sm px-2 py-1" value={n.size} onChange={(e) => patchNew(n.key, { size: e.target.value })}>
                    {m.sizes.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name} · {formatCurrency(s.priceCents)}
                      </option>
                    ))}
                  </select>
                )}
                {m.requiredChoices.length > 0 && (
                  <select className="rounded-lg border border-editorial-line text-sm px-2 py-1" value={n.choice ?? ""} onChange={(e) => patchNew(n.key, { choice: e.target.value || undefined })}>
                    <option value="">Choose…</option>
                    {m.requiredChoices.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
                <label className="text-[12px] flex items-center gap-1">
                  Qty
                  <input type="number" min={1} max={50} value={n.quantity} onChange={(e) => patchNew(n.key, { quantity: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} className="w-16 rounded-lg border border-editorial-line text-sm px-2 py-1" />
                </label>
              </div>
              {(m.addOns.length > 0 || m.removals.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {m.addOns.map((a) => (
                    <button key={a.name} type="button" className={chip(n.additions.includes(a.name))} onClick={() => patchNew(n.key, { additions: toggle(n.additions, a.name) })}>
                      + {a.name}
                      {a.priceDeltaCents ? ` ${formatCurrency(a.priceDeltaCents)}` : ""}
                    </button>
                  ))}
                  {m.removals.map((r) => (
                    <button key={r} type="button" className={chip(n.removals.includes(r))} onClick={() => patchNew(n.key, { removals: toggle(n.removals, r) })}>
                      no {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

      <div className="flex gap-2">
        <select className={field} value={draftItem} onChange={(e) => setDraftItem(e.target.value)}>
          <option value="">Add an item…</option>
          {menuItems.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!draft}
          className="px-3 rounded-lg border border-editorial-green text-editorial-green text-sm font-semibold disabled:opacity-40 cursor-pointer"
          onClick={() => {
            addNew(draftItem);
            setDraftItem("");
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

type Settle = { adminNote?: string; adjustment: ModifyPayload["adjustment"]; manualMethod?: string; emailLink: boolean };

function SettleFooter(props: {
  currentTotalCents: number;
  newTotalCents: number;
  discountCents: number;
  isStripe: boolean;
  canSubmit: boolean;
  emptyWarning: boolean;
  weekly?: boolean;
  onSubmit: (s: Settle) => Promise<Result>;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [adjustment, setAdjustment] = useState<ModifyPayload["adjustment"]>("stripe_link");
  const [manualMethod, setManualMethod] = useState("");
  const [emailLink, setEmailLink] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const delta = props.newTotalCents - props.currentTotalCents;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await props.onSubmit({ adminNote: note.trim() || undefined, adjustment, manualMethod: manualMethod.trim() || undefined, emailLink });
      if (!res.success) setError(res.error || "Could not modify the order.");
      else {
        setResult(res);
        if (!res.checkoutUrl) router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not modify the order.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg bg-editorial-paper-2 px-3 py-3 space-y-2">
        <p className="text-sm font-semibold text-editorial-ink">{result.message ?? "Order updated."}</p>
        {result.checkoutUrl && (
          <>
            <p className="text-[11px] text-editorial-ink-soft">
              {result.emailed ? "We emailed the customer the payment link. " : ""}
              {props.weekly ? "Every change in this week applies automatically once this one link is paid." : "The order updates automatically once it is paid."}
            </p>
            <input readOnly value={result.checkoutUrl} className={field} onFocus={(e) => e.currentTarget.select()} />
          </>
        )}
        <button type="button" className="text-[12px] underline cursor-pointer" onClick={() => router.refresh()}>
          Done
        </button>
      </div>
    );
  }

  const needsMethod = adjustment === "manual" && delta > 0 && props.isStripe;
  const ok = props.canSubmit && !busy && (!needsMethod || manualMethod.trim().length > 0);
  const noun = props.weekly ? "week" : "order";

  return (
    <div className="space-y-3">
      <input className={field} placeholder="Note for the customer / kitchen (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

      <div className="rounded-lg bg-editorial-paper-2 px-3 py-2 text-[12px] space-y-1">
        <div className="flex justify-between">
          <span>Current {props.weekly ? "total (changed days)" : "total"}</span>
          <span>{formatCurrency(props.currentTotalCents)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>New total</span>
          <span>{formatCurrency(props.newTotalCents)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>{delta < 0 ? (props.isStripe ? "Refunded to customer automatically" : "Owed back to customer") : delta > 0 ? "Additional amount due" : "Difference"}</span>
          <span>{formatCurrency(Math.abs(delta))}</span>
        </div>
        {props.weekly && <p className="text-editorial-ink-soft">Changes across days are netted into one payment or one refund.</p>}
        {props.discountCents > 0 && <p className="text-editorial-ink-soft">Existing discounts are kept as fixed amounts.</p>}
      </div>

      {delta > 0 && props.isStripe && (
        <div className="space-y-2">
          <select className={field} value={adjustment} onChange={(e) => setAdjustment(e.target.value as ModifyPayload["adjustment"])}>
            <option value="stripe_link">Customer pays by card via ONE payment link</option>
            <option value="manual">Collected another way (cash, Zelle…)</option>
            <option value="comped">Waive the extra cost</option>
          </select>
          {adjustment === "manual" && <input className={field} placeholder="Method, e.g. cash or Zelle" value={manualMethod} onChange={(e) => setManualMethod(e.target.value)} />}
          {adjustment === "stripe_link" && (
            <label className="text-[12px] flex items-center gap-2">
              <input type="checkbox" checked={emailLink} onChange={(e) => setEmailLink(e.target.checked)} />
              Email the payment link to the customer
            </label>
          )}
        </div>
      )}

      {props.emptyWarning && <p className="text-[12px] text-red-700">An order needs at least one item. Cancel the order instead.</p>}
      {error && <p className="text-[12px] text-red-700">{error}</p>}

      <button type="button" disabled={!ok} onClick={submit} className="w-full py-2.5 rounded-full bg-editorial-green text-white text-sm font-semibold disabled:opacity-40 cursor-pointer">
        {busy
          ? "Saving…"
          : delta > 0 && props.isStripe && adjustment === "stripe_link"
            ? `Save & send one payment link (${formatCurrency(delta)})`
            : delta < 0 && props.isStripe
              ? `Save & refund ${formatCurrency(-delta)}`
              : `Save ${noun} changes`}
      </button>
    </div>
  );
}

const OPEN_BTN =
  "w-full py-2.5 rounded-full border border-editorial-green text-editorial-green text-sm font-semibold bg-white cursor-pointer hover:bg-editorial-paper-2 transition";

export function ModifyOrderClient(props: {
  currentTotalCents: number;
  currentSubtotalCents: number;
  discountCents: number;
  isStripe: boolean;
  lines: ModifyLine[];
  menuItems: ModifyMenuItem[];
  action: (payload: ModifyPayload) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [out, setOut] = useState<EditorOutput | null>(null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={OPEN_BTN}>
        Modify order…
      </button>
    );
  }
  return (
    <div className="rounded-[14px] border border-editorial-line bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-editorial-ink">Modify order</p>
        <button type="button" className="text-[12px] text-editorial-ink-soft cursor-pointer" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <OrderEditor
        order={{ orderId: "single", currentTotalCents: props.currentTotalCents, discountCents: props.discountCents, lines: props.lines, menuItems: props.menuItems }}
        onChange={setOut}
      />
      <SettleFooter
        currentTotalCents={props.currentTotalCents}
        newTotalCents={out?.newTotalCents ?? props.currentTotalCents}
        discountCents={props.discountCents}
        isStripe={props.isStripe}
        canSubmit={!!out?.dirty && (out?.remaining ?? 0) > 0}
        emptyWarning={!!out?.dirty && (out?.remaining ?? 1) < 1}
        onSubmit={(s) => props.action({ ...out!.edit, ...s })}
      />
    </div>
  );
}

export type WeekOrder = EditorOrder & { dateLabel: string };

/** Edit every day of a weekly checkout together; settled with ONE pay link / ONE refund. */
export function ModifyWeekClient(props: {
  orders: WeekOrder[];
  isStripe: boolean;
  action: (payload: WeekPayload) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [outs, setOuts] = useState<Record<string, EditorOutput>>({});
  const [tab, setTab] = useState(props.orders[0]?.orderId ?? "");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={OPEN_BTN}>
        Modify whole week ({props.orders.length} days, one payment)…
      </button>
    );
  }

  const changed = props.orders.filter((o) => outs[o.orderId]?.dirty);
  const current = changed.reduce((t, o) => t + o.currentTotalCents, 0);
  const next = changed.reduce((t, o) => t + (outs[o.orderId]?.newTotalCents ?? o.currentTotalCents), 0);
  const anyEmpty = changed.some((o) => (outs[o.orderId]?.remaining ?? 1) < 1);

  return (
    <div className="rounded-[14px] border border-editorial-line bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-editorial-ink">Modify whole week</p>
        <button type="button" className="text-[12px] text-editorial-ink-soft cursor-pointer" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {props.orders.map((o) => (
          <button key={o.orderId} type="button" className={chip(tab === o.orderId)} onClick={() => setTab(o.orderId)}>
            {o.dateLabel}
            {outs[o.orderId]?.dirty ? " •" : ""}
          </button>
        ))}
      </div>
      {props.orders.map((o) => (
        <div key={o.orderId} hidden={tab !== o.orderId}>
          <OrderEditor
            order={{ ...o, title: o.dateLabel }}
            onChange={(out) => setOuts((cur) => (cur[o.orderId] && JSON.stringify(cur[o.orderId]) === JSON.stringify(out) ? cur : { ...cur, [o.orderId]: out }))}
          />
        </div>
      ))}
      <SettleFooter
        weekly
        currentTotalCents={current}
        newTotalCents={next}
        discountCents={0}
        isStripe={props.isStripe}
        canSubmit={changed.length > 0 && !anyEmpty}
        emptyWarning={anyEmpty}
        onSubmit={(s) => props.action({ edits: changed.map((o) => ({ orderId: o.orderId, ...outs[o.orderId].edit })), ...s })}
      />
    </div>
  );
}
