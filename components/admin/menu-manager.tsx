"use client";

/**
 * Admin > Menu: one scannable list grouped by category. Adding happens where
 * you are (a "+ Add item" on every category), editing happens in a side
 * drawer that holds the basics AND the choices / extras together, and the
 * import options live behind a single Import menu.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BulkMenuUpload } from "@/components/admin/bulk-menu-upload";
import { MenuUrlImport } from "@/components/admin/menu-url-import";
import { MenuItemDrawer } from "@/components/admin/menu-item-drawer";
import type {
  MenuManagerItem,
  MenuManagerSchool,
  SaveMenuItemResult,
} from "@/components/admin/menu-types";

export type { MenuManagerItem, MenuManagerSchool, SaveMenuItemResult } from "@/components/admin/menu-types";

interface Props {
  items: MenuManagerItem[];
  schools: MenuManagerSchool[];
  /** Real categories in the restaurant's configured display order. */
  categories: string[];
  hasUncategorized: boolean;
  saveMenuItem: (formData: FormData) => Promise<SaveMenuItemResult>;
  setMenuItemActive: (id: string, isActive: boolean) => Promise<void>;
}

const UNCATEGORIZED = "Uncategorized";
const fmt = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

type DrawerState = { open: false } | { open: true; item: MenuManagerItem | null; category: string | null };
type ImportMode = null | "url" | "bulk";

export function MenuManager({ items, schools, categories, hasUncategorized, saveMenuItem, setMenuItemActive }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [importMode, setImportMode] = useState<ImportMode>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [activeOverride, setActiveOverride] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  const groups = useMemo(() => {
    const names = [...categories, ...(hasUncategorized ? [UNCATEGORIZED] : [])];
    const q = query.trim().toLowerCase();
    return names
      .map((name) => {
        const all = items.filter((i) => (i.category || UNCATEGORIZED) === name);
        const shown = q
          ? all.filter((i) => `${i.name} ${i.description ?? ""}`.toLowerCase().includes(q))
          : all;
        return { name, all, shown };
      })
      .filter((g) => g.all.length > 0);
  }, [items, categories, hasUncategorized, query]);

  const visibleGroups = groups.filter((g) => (filter === "all" || filter === g.name) && g.shown.length > 0);

  function toggleActive(item: MenuManagerItem) {
    const current = activeOverride[item.id] ?? item.isActive;
    setActiveOverride((p) => ({ ...p, [item.id]: !current }));
    startTransition(async () => {
      try {
        await setMenuItemActive(item.id, !current);
        router.refresh();
      } catch {
        setActiveOverride((p) => ({ ...p, [item.id]: current }));
      }
    });
  }

  const openAdd = (category: string | null) => setDrawer({ open: true, item: null, category });

  const importMenu = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setImportMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={importMenuOpen}
        className="px-4 py-2 rounded-full border border-editorial-line text-editorial-ink-soft text-[13px] font-semibold hover:bg-editorial-paper-2"
      >
        Import ▾
      </button>
      {importMenuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setImportMenuOpen(false)} />
          <div role="menu" className="absolute right-0 mt-2 z-40 w-[260px] rounded-[14px] border border-editorial-line bg-white p-1.5 shadow-xl">
            {[
              { mode: "url" as const, icon: "🪄", title: "From your website", sub: "Paste a link to your menu page" },
              { mode: "bulk" as const, icon: "⬆", title: "From a spreadsheet", sub: "Excel or CSV, with prices and choices" },
            ].map((o) => (
              <button
                key={o.mode}
                role="menuitem"
                type="button"
                onClick={() => {
                  setImportMode(o.mode);
                  setImportMenuOpen(false);
                }}
                className="w-full text-left flex gap-3 items-start px-3 py-2.5 rounded-[10px] hover:bg-editorial-paper-2"
              >
                <span className="text-[16px]">{o.icon}</span>
                <span>
                  <span className="block text-[13px] font-semibold text-editorial-ink">{o.title}</span>
                  <span className="block text-[11px] text-editorial-ink-faint">{o.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const empty = items.length === 0;

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-[32px] font-editorial font-medium text-editorial-ink mr-auto">Menu</h1>
        {!empty && (
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${items.length} items`}
              aria-label="Search menu"
              className="w-full sm:w-[260px] order-last sm:order-none rounded-full border border-editorial-line text-[13px] px-4 py-2 bg-white focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
            />
            {importMenu}
            <button
              type="button"
              onClick={() => openAdd(filter !== "all" && filter !== UNCATEGORIZED ? filter : null)}
              className="px-5 py-2 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep"
            >
              ＋ Add item
            </button>
          </>
        )}
      </div>

      {empty ? (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-editorial-green">Menu · 0 items</p>
            <h2 className="text-[30px] font-editorial font-medium text-editorial-ink leading-tight">Let&apos;s get your menu in.</h2>
            <p className="text-[14px] text-editorial-ink-soft mt-1">Pick the fastest route. You can mix them, and everything stays editable.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { icon: "🪄", title: "Import from your website", sub: "Paste your menu page link. We read the dishes, descriptions and prices for you to review.", cta: "Paste a link", onClick: () => setImportMode("url"), primary: true },
              { icon: "⬆", title: "Upload a spreadsheet", sub: "Fill our template in Excel or Google Sheets, with prices and choices, then drop it here.", cta: "Upload a file", onClick: () => setImportMode("bulk"), primary: false },
              { icon: "＋", title: "Add dishes one by one", sub: "A single panel for the name, price, photo and every choice. Best for a short menu.", cta: "Add first item", onClick: () => openAdd(null), primary: false },
            ].map((c) => (
              <button
                key={c.title}
                type="button"
                onClick={c.onClick}
                className={`text-left rounded-[20px] border p-5 flex flex-col gap-2 min-h-[190px] transition ${
                  c.primary
                    ? "bg-editorial-green text-editorial-paper border-editorial-green hover:bg-editorial-green-deep"
                    : "bg-white border-editorial-line hover:bg-editorial-paper-2"
                }`}
              >
                <span className="text-[22px]">{c.icon}</span>
                <span className="text-[18px] font-editorial font-medium">{c.title}</span>
                <span className={`text-[13px] leading-snug ${c.primary ? "opacity-80" : "text-editorial-ink-soft"}`}>{c.sub}</span>
                <span className="mt-auto text-[13px] font-semibold">{c.cta} →</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Filter by category">
            {[{ name: "all", label: `All · ${items.length}` }, ...groups.map((g) => ({ name: g.name, label: `${g.name} · ${g.all.length}` }))].map((c) => (
              <button
                key={c.name}
                role="tab"
                aria-selected={filter === c.name}
                type="button"
                onClick={() => setFilter(c.name)}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-full border text-[12px] font-semibold transition ${
                  filter === c.name
                    ? "bg-editorial-green text-editorial-paper border-editorial-green"
                    : "bg-white text-editorial-ink-soft border-editorial-line hover:bg-editorial-paper-2"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {visibleGroups.length === 0 && (
            <p className="text-[13px] text-editorial-ink-soft py-6">No items match &ldquo;{query}&rdquo;.</p>
          )}

          {visibleGroups.map((g) => (
            <section key={g.name} className="rounded-[20px] border border-editorial-line bg-white p-3 sm:p-4 space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h2 className="text-[20px] font-editorial font-medium text-editorial-ink">{g.name}</h2>
                <span className="text-[12px] text-editorial-ink-faint">{g.all.length} item{g.all.length !== 1 ? "s" : ""}</span>
                <button
                  type="button"
                  onClick={() => openAdd(g.name === UNCATEGORIZED ? null : g.name)}
                  className="ml-auto text-[12px] font-semibold text-editorial-green hover:underline underline-offset-2"
                >
                  ＋ Add item{g.name === UNCATEGORIZED ? "" : ` to ${g.name}`}
                </button>
              </div>
              {g.shown.map((item) => {
                const active = activeOverride[item.id] ?? item.isActive;
                const extras = item.options.filter((o) => o.optionType === "ADD_ON").length;
                const removals = item.options.length - extras;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 rounded-[14px] px-3 py-2 bg-editorial-paper-2/60 hover:bg-editorial-paper-2 transition ${active ? "" : "opacity-60"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setDrawer({ open: true, item, category: item.category })}
                      className="flex flex-1 min-w-0 items-center gap-3 text-left"
                      aria-label={`Edit ${item.name}`}
                    >
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="w-11 h-11 rounded-[10px] object-cover flex-shrink-0" />
                      ) : (
                        <span className="w-11 h-11 rounded-[10px] bg-editorial-line flex-shrink-0" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-editorial-ink truncate">{item.name}</span>
                        {item.description && (
                          <span className="block text-[12px] text-editorial-ink-faint truncate">{item.description}</span>
                        )}
                      </span>
                      <span className="hidden md:flex gap-1.5 flex-shrink-0">
                        {item.requiredChoices.length > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-editorial-sage text-editorial-green">
                            Pick one · {item.requiredChoices.length}
                          </span>
                        )}
                        {item.sizes.length > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-editorial-sage text-editorial-green">
                            {item.sizes.length} sizes
                          </span>
                        )}
                        {extras > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F6EED9] text-[#6E5C2C]">
                            {extras} add-on{extras !== 1 ? "s" : ""}
                          </span>
                        )}
                        {removals > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F6EED9] text-[#6E5C2C]">
                            {removals} removal{removals !== 1 ? "s" : ""}
                          </span>
                        )}
                      </span>
                      <span className="text-[14px] font-bold text-editorial-ink flex-shrink-0 tabular-nums">
                        {item.sizes.length > 0 ? `from ${fmt(Math.min(...item.sizes.map((s) => s.priceCents)))}` : fmt(item.basePriceCents)}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={active}
                      aria-label={`${item.name} visible to customers`}
                      onClick={() => toggleActive(item)}
                      className={`relative flex-shrink-0 w-9 h-5 rounded-full transition ${active ? "bg-editorial-green" : "bg-editorial-line"}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${active ? "left-[18px]" : "left-0.5"}`} />
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}

      {drawer.open && (
        <MenuItemDrawer
          key={drawer.item?.id ?? "new"}
          item={drawer.item}
          defaultCategory={drawer.category}
          categories={categories}
          allItems={items}
          schools={schools}
          saveMenuItem={saveMenuItem}
          onClose={() => setDrawer({ open: false })}
        />
      )}

      {importMode && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Import menu">
          <div className="fixed inset-0 bg-black/30" onClick={() => setImportMode(null)} />
          <div className="relative w-full max-w-3xl rounded-[20px] border border-editorial-line bg-white p-4 sm:p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[20px] font-editorial font-medium text-editorial-ink">
                {importMode === "url" ? "Import from your website" : "Upload a spreadsheet"}
              </h2>
              <button type="button" onClick={() => setImportMode(null)} aria-label="Close" className="text-[20px] text-editorial-ink-faint hover:text-editorial-ink leading-none">✕</button>
            </div>
            {importMode === "url" ? <MenuUrlImport /> : <BulkMenuUpload />}
          </div>
        </div>
      )}
    </>
  );
}
