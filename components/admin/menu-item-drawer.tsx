"use client";

/**
 * Side drawer for adding / editing one menu item. Everything about the item
 * lives here: basics, required choice, sizes, add-ons, removals, location
 * availability. It is a friendlier editor over the same stored fields the
 * customer order form reads (requiredChoices, MenuItemSize, MenuOption) and
 * posts to a single server action.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUpload } from "@/components/admin/image-upload";
import { DietaryTagsPicker } from "@/components/admin/dietary-tags-picker";
import { dollarsToCents } from "@/lib/menu-editor";
import type { MenuManagerItem, MenuManagerSchool, SaveMenuItemResult } from "@/components/admin/menu-types";

interface Props {
  /** null = creating a new item. */
  item: MenuManagerItem | null;
  /** Category pre-filled when adding from a category header. */
  defaultCategory: string | null;
  categories: string[];
  allItems: MenuManagerItem[];
  schools: MenuManagerSchool[];
  saveMenuItem: (formData: FormData) => Promise<SaveMenuItemResult>;
  onClose: () => void;
}

interface OptRow {
  key: number;
  id?: string;
  name: string;
  optionType: "ADD_ON" | "REMOVAL";
  price: string;
}
interface SizeRow {
  key: number;
  name: string;
  price: string;
}
interface ChoiceRow {
  key: number;
  text: string;
}

const NEW_CATEGORY = "__new__";
const fieldCls =
  "w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green bg-white";
const smallBtn =
  "text-[12px] font-semibold text-editorial-green hover:underline underline-offset-2 disabled:opacity-40";

let keySeed = 1;
const nextKey = () => keySeed++;

const centsToDollars = (c: number) => (c / 100).toFixed(2);

export function MenuItemDrawer({ item, defaultCategory, categories, allItems, schools, saveMenuItem, onClose }: Props) {
  const router = useRouter();
  const isNew = !item;
  const [formKey, setFormKey] = useState(0);

  return (
    <DrawerForm
      key={formKey}
      item={item}
      isNew={isNew}
      defaultCategory={defaultCategory}
      categories={categories}
      allItems={allItems}
      schools={schools}
      saveMenuItem={saveMenuItem}
      onClose={onClose}
      onSavedAndContinue={() => {
        router.refresh();
        setFormKey((k) => k + 1);
      }}
    />
  );
}

function DrawerForm({
  item,
  isNew,
  defaultCategory,
  categories,
  allItems,
  schools,
  saveMenuItem,
  onClose,
  onSavedAndContinue,
}: Props & { isNew: boolean; onSavedAndContinue: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const startCategory = item ? item.category : defaultCategory;
  const categoryKnown = !startCategory || categories.includes(startCategory);
  const [categorySel, setCategorySel] = useState<string>(
    startCategory ? (categoryKnown ? startCategory : NEW_CATEGORY) : ""
  );
  const [newCategory, setNewCategory] = useState(startCategory && !categoryKnown ? startCategory : "");

  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? centsToDollars(item.basePriceCents) : "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [isUpsell, setIsUpsell] = useState(item?.isUpsell ?? false);
  const [featured, setFeatured] = useState(item?.featuredOnLanding ?? false);

  const [choices, setChoices] = useState<ChoiceRow[]>(
    (item?.requiredChoices ?? []).map((t) => ({ key: nextKey(), text: t }))
  );
  const [sizes, setSizes] = useState<SizeRow[]>(
    (item?.sizes ?? []).map((s) => ({ key: nextKey(), name: s.name, price: centsToDollars(s.priceCents) }))
  );
  const [options, setOptions] = useState<OptRow[]>(
    (item?.options ?? []).map((o) => ({
      key: nextKey(),
      id: o.id,
      name: o.name,
      optionType: o.optionType,
      price: centsToDollars(o.priceDeltaCents),
    }))
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const originalOptionIds = useMemo(() => (item?.options ?? []).map((o) => o.id), [item]);

  const markDirty = useCallback(() => setDirty(true), []);

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Discard your changes?")) return;
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const copySources = allItems.filter(
    (i) => i.id !== item?.id && (i.requiredChoices.length > 0 || i.options.length > 0 || i.sizes.length > 0)
  );

  function copyFrom(id: string) {
    const src = allItems.find((i) => i.id === id);
    if (!src) return;
    setChoices(src.requiredChoices.map((t) => ({ key: nextKey(), text: t })));
    setSizes(src.sizes.map((s) => ({ key: nextKey(), name: s.name, price: centsToDollars(s.priceCents) })));
    // Copied extras are new rows (no id) so they never overwrite the source item.
    setOptions(
      src.options.map((o) => ({
        key: nextKey(),
        name: o.name,
        optionType: o.optionType,
        price: centsToDollars(o.priceDeltaCents),
      }))
    );
    markDirty();
  }

  function focusSelector(sel: string) {
    setTimeout(() => (document.querySelector(sel) as HTMLInputElement | null)?.focus(), 0);
  }

  function addChoiceAfter(index: number, text = "") {
    setChoices((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, { key: nextKey(), text });
      return next;
    });
    focusSelector(`[data-choice-idx="${index + 1}"]`);
  }

  function onChoicePaste(index: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!/[\n,]/.test(text)) return;
    e.preventDefault();
    const parts = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    setChoices((prev) => {
      const next = [...prev];
      const current = next[index];
      if (current && !current.text.trim()) next.splice(index, 1, ...parts.map((t) => ({ key: nextKey(), text: t })));
      else next.splice(index + 1, 0, ...parts.map((t) => ({ key: nextKey(), text: t })));
      return next;
    });
    markDirty();
  }

  function move<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, index: number, dir: -1 | 1) {
    setter((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
    markDirty();
  }

  /** Moves within the add-on / removal sub-list, keeping the other type's rows in place. */
  function moveOption(key: number, dir: -1 | 1) {
    setOptions((prev) => {
      const type = prev.find((o) => o.key === key)?.optionType;
      const same = prev.filter((o) => o.optionType === type);
      const idx = same.findIndex((o) => o.key === key);
      const target = same[idx + dir];
      if (!target) return prev;
      const next = [...prev];
      const a = next.findIndex((o) => o.key === key);
      const b = next.findIndex((o) => o.key === target.key);
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
    markDirty();
  }

  async function submit(addAnother: boolean) {
    setError(null);
    const form = formRef.current;
    if (!form) return;

    const priceCents = dollarsToCents(price || "0");
    if (priceCents === null) return setError("Enter a valid price.");
    if (name.trim().length < 2) return setError("Give the item a name.");

    const optionPayload: { id?: string; name: string; optionType: "ADD_ON" | "REMOVAL"; priceDeltaCents: number }[] = [];
    for (const o of options) {
      if (!o.name.trim()) continue;
      const cents = dollarsToCents(o.price || "0");
      if (cents === null) return setError(`Check the price for "${o.name}".`);
      optionPayload.push({ id: o.id, name: o.name.trim(), optionType: o.optionType, priceDeltaCents: cents });
    }
    const sizeLines: string[] = [];
    for (const s of sizes) {
      if (!s.name.trim() && !s.price.trim()) continue;
      const cents = dollarsToCents(s.price);
      if (!s.name.trim() || cents === null) return setError("Each size needs a name and a price.");
      if (/[|\n]/.test(s.name)) return setError("Size names can't contain the | character.");
      sizeLines.push(`${s.name.trim()} | ${(cents / 100).toFixed(2)}`);
    }
    const choiceTexts = choices.map((c) => c.text.trim()).filter(Boolean);
    if (choiceTexts.some((c) => /[,\n]/.test(c))) {
      return setError("Choices can't contain commas. Use a separate row for each choice.");
    }
    const category = categorySel === NEW_CATEGORY ? newCategory.trim() : categorySel;

    const fd = new FormData(form); // picks up photo, dietary tags, location checkboxes
    fd.set("id", item?.id ?? "");
    fd.set("name", name.trim());
    fd.set("price", (priceCents / 100).toFixed(2));
    fd.set("description", description);
    fd.set("category", category);
    fd.set("isActive", isActive ? "on" : "");
    fd.set("isUpsell", isUpsell ? "on" : "");
    fd.set("featuredOnLanding", featured ? "on" : "");
    fd.set("requiredChoices", choiceTexts.join("\n"));
    fd.set("sizes", sizeLines.join("\n"));
    fd.set("options", JSON.stringify(optionPayload));
    fd.set("originalOptionIds", JSON.stringify(originalOptionIds));

    setBusy(true);
    try {
      const res = await saveMenuItem(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (addAnother) {
        onSavedAndContinue();
      } else {
        router.refresh();
        onClose();
      }
    } catch {
      setError("Could not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const addOns = options.filter((o) => o.optionType === "ADD_ON");
  const removals = options.filter((o) => o.optionType === "REMOVAL");

  function optionList(rows: OptRow[], type: "ADD_ON" | "REMOVAL") {
    return (
      <div className="space-y-1.5">
        {rows.map((o, i) => (
          <div key={o.key} className="flex items-center gap-1.5">
            <div className="flex flex-col flex-shrink-0">
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveOption(o.key, -1)} className="h-3.5 w-5 text-[9px] leading-none text-editorial-ink-faint hover:text-editorial-ink disabled:opacity-25">▲</button>
              <button type="button" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => moveOption(o.key, 1)} className="h-3.5 w-5 text-[9px] leading-none text-editorial-ink-faint hover:text-editorial-ink disabled:opacity-25">▼</button>
            </div>
            <input
              aria-label={type === "ADD_ON" ? "Add-on name" : "Removal name"}
              value={o.name}
              onChange={(e) => {
                setOptions((p) => p.map((x) => (x.key === o.key ? { ...x, name: e.target.value } : x)));
                markDirty();
              }}
              placeholder={type === "ADD_ON" ? "e.g. Extra cheese" : "e.g. No onions"}
              data-opt-type={type}
              className={`${fieldCls} flex-1 min-w-0`}
            />
            {type === "ADD_ON" && (
              <div className="relative w-24 flex-shrink-0">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-editorial-ink-faint">+ $</span>
                <input
                  aria-label="Extra price"
                  inputMode="decimal"
                  value={o.price}
                  onChange={(e) => {
                    setOptions((p) => p.map((x) => (x.key === o.key ? { ...x, price: e.target.value } : x)));
                    markDirty();
                  }}
                  className={`${fieldCls} pl-8 text-right`}
                />
              </div>
            )}
            <button
              type="button"
              aria-label={`Remove ${o.name || "row"}`}
              onClick={() => {
                setOptions((p) => p.filter((x) => x.key !== o.key));
                markDirty();
              }}
              className="w-6 flex-shrink-0 text-editorial-ink-faint hover:text-editorial-clay"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className={smallBtn}
          onClick={() => {
            setOptions((p) => [...p, { key: nextKey(), name: "", optionType: type, price: "0.00" }]);
            markDirty();
            setTimeout(() => {
              const els = document.querySelectorAll<HTMLInputElement>(`input[data-opt-type="${type}"]`);
              els[els.length - 1]?.focus();
            }, 20);
          }}
        >
          ＋ {type === "ADD_ON" ? "Add an add-on" : "Add a removal"}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={isNew ? "Add menu item" : `Edit ${item?.name}`}>
      <div className="absolute inset-0 bg-black/30" onClick={() => !dirty && onClose()} />
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
        onChange={markDirty}
        className="relative bg-white border-l border-editorial-line w-full sm:w-[640px] h-full flex flex-col shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-editorial-line">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-editorial-green">
              {isNew ? `New item${categorySel && categorySel !== NEW_CATEGORY ? ` · ${categorySel}` : ""}` : "Edit item"}
            </p>
            <h2 className="text-[24px] font-editorial font-medium text-editorial-ink leading-tight">
              {isNew ? "Add an item" : item?.name}
            </h2>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close" className="text-[20px] text-editorial-ink-faint hover:text-editorial-ink leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="grid grid-cols-[112px_1fr] gap-3">
            <ImageUpload name="imageUrl" defaultValue={item?.imageUrl} label="Photo" aspect="square" />
            <div className="space-y-2.5">
              <div>
                <label className="text-[12px] text-editorial-ink-soft block mb-1">Name</label>
                <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="e.g. Crispy Chicken Sandwich" className={fieldCls} />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[12px] text-editorial-ink-soft block mb-1">Price</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-editorial-ink-faint">$</span>
                    <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" required placeholder="12.99" className={`${fieldCls} pl-6`} />
                  </div>
                </div>
                <div>
                  <label className="text-[12px] text-editorial-ink-soft block mb-1">Category</label>
                  <select value={categorySel} onChange={(e) => setCategorySel(e.target.value)} className={fieldCls}>
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value={NEW_CATEGORY}>＋ New category…</option>
                  </select>
                </div>
              </div>
              {categorySel === NEW_CATEGORY && (
                <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name" className={fieldCls} />
              )}
            </div>
          </div>

          <div>
            <label className="text-[12px] text-editorial-ink-soft block mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="A short, appetizing description" className={`${fieldCls} resize-none`} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-[18px] font-editorial font-medium text-editorial-ink">Choices &amp; extras</h3>
              {copySources.length > 0 && (
                <select
                  aria-label="Copy choices and extras from another item"
                  value=""
                  onChange={(e) => e.target.value && copyFrom(e.target.value)}
                  className="rounded-lg border border-editorial-line text-[12px] text-editorial-ink-soft px-2 py-1 bg-white max-w-[220px]"
                >
                  <option value="">Copy from another item…</option>
                  {copySources.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              )}
            </div>

            <section className="rounded-[14px] border border-editorial-line bg-editorial-paper-2 p-3 space-y-2">
              <div>
                <p className="text-[13px] font-semibold text-editorial-ink">Pick one (required)</p>
                <p className="text-[11px] text-editorial-ink-faint">e.g. Beef / Chicken / Vegan. Customers must choose exactly one. Leave empty if not needed.</p>
              </div>
              {choices.map((c, i) => (
                <div key={c.key} className="flex items-center gap-1.5">
                  <div className="flex flex-col flex-shrink-0">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(setChoices, i, -1)} className="h-3.5 w-5 text-[9px] leading-none text-editorial-ink-faint hover:text-editorial-ink disabled:opacity-25">▲</button>
                    <button type="button" aria-label="Move down" disabled={i === choices.length - 1} onClick={() => move(setChoices, i, 1)} className="h-3.5 w-5 text-[9px] leading-none text-editorial-ink-faint hover:text-editorial-ink disabled:opacity-25">▼</button>
                  </div>
                  <input
                    aria-label={`Choice ${i + 1}`}
                    data-choice-idx={i}
                    value={c.text}
                    onChange={(e) => {
                      setChoices((p) => p.map((x) => (x.key === c.key ? { ...x, text: e.target.value } : x)));
                      markDirty();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (c.text.trim()) addChoiceAfter(i);
                      } else if (e.key === "Backspace" && !c.text) {
                        e.preventDefault();
                        setChoices((p) => p.filter((x) => x.key !== c.key));
                        focusSelector(`[data-choice-idx="${Math.max(0, i - 1)}"]`);
                      }
                    }}
                    onPaste={(e) => onChoicePaste(i, e)}
                    placeholder="Choice name"
                    className={`${fieldCls} flex-1 min-w-0`}
                  />
                  <button type="button" aria-label={`Remove ${c.text || "choice"}`} onClick={() => { setChoices((p) => p.filter((x) => x.key !== c.key)); markDirty(); }} className="w-6 flex-shrink-0 text-editorial-ink-faint hover:text-editorial-clay">✕</button>
                </div>
              ))}
              <button type="button" className={smallBtn} onClick={() => { addChoiceAfter(choices.length - 1); markDirty(); }}>
                ＋ Add a choice <span className="font-normal text-editorial-ink-faint">(Enter adds the next row; paste a list to fill many)</span>
              </button>
            </section>

            <section className="rounded-[14px] border border-editorial-line bg-editorial-paper-2 p-3 space-y-2">
              <div>
                <p className="text-[13px] font-semibold text-editorial-ink">Sizes</p>
                <p className="text-[11px] text-editorial-ink-faint">Each size has its own price, which replaces the base price. Leave empty for a single price.</p>
              </div>
              {sizes.map((s, i) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <div className="flex flex-col flex-shrink-0">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(setSizes, i, -1)} className="h-3.5 w-5 text-[9px] leading-none text-editorial-ink-faint hover:text-editorial-ink disabled:opacity-25">▲</button>
                    <button type="button" aria-label="Move down" disabled={i === sizes.length - 1} onClick={() => move(setSizes, i, 1)} className="h-3.5 w-5 text-[9px] leading-none text-editorial-ink-faint hover:text-editorial-ink disabled:opacity-25">▼</button>
                  </div>
                  <input aria-label="Size name" value={s.name} onChange={(e) => { setSizes((p) => p.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x))); markDirty(); }} placeholder="e.g. Large" className={`${fieldCls} flex-1 min-w-0`} />
                  <div className="relative w-24 flex-shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-editorial-ink-faint">$</span>
                    <input aria-label="Size price" inputMode="decimal" value={s.price} onChange={(e) => { setSizes((p) => p.map((x) => (x.key === s.key ? { ...x, price: e.target.value } : x))); markDirty(); }} className={`${fieldCls} pl-6 text-right`} />
                  </div>
                  <button type="button" aria-label={`Remove ${s.name || "size"}`} onClick={() => { setSizes((p) => p.filter((x) => x.key !== s.key)); markDirty(); }} className="w-6 flex-shrink-0 text-editorial-ink-faint hover:text-editorial-clay">✕</button>
                </div>
              ))}
              <button type="button" className={smallBtn} onClick={() => { setSizes((p) => [...p, { key: nextKey(), name: "", price: price || "" }]); markDirty(); }}>
                ＋ Add a size
              </button>
            </section>

            <section className="rounded-[14px] border border-editorial-line bg-editorial-paper-2 p-3 space-y-2">
              <div>
                <p className="text-[13px] font-semibold text-editorial-ink">Add-ons <span className="font-normal text-editorial-ink-faint">(optional extras, priced)</span></p>
              </div>
              {optionList(addOns, "ADD_ON")}
            </section>

            <section className="rounded-[14px] border border-editorial-line bg-editorial-paper-2 p-3 space-y-2">
              <div>
                <p className="text-[13px] font-semibold text-editorial-ink">Removals <span className="font-normal text-editorial-ink-faint">(free “no onions” style options)</span></p>
              </div>
              {optionList(removals, "REMOVAL")}
            </section>
          </div>

          <details className="rounded-[14px] border border-editorial-line">
            <summary className="px-3 py-2.5 cursor-pointer text-[13px] font-semibold text-editorial-ink list-none flex items-center justify-between">
              More settings <span className="text-[11px] text-editorial-ink-faint">▼</span>
            </summary>
            <div className="border-t border-editorial-line p-3 space-y-3">
              <div>
                <label className="text-[12px] text-editorial-ink-soft block mb-1">Dietary tags</label>
                <DietaryTagsPicker defaultValue={item?.dietaryTags ?? []} />
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={isUpsell} onChange={(e) => setIsUpsell(e.target.checked)} className="mt-0.5 rounded border-editorial-line text-editorial-green focus:ring-editorial-green" />
                <span className="text-[12px] text-editorial-ink">Show in cart upsell <span className="text-editorial-ink-faint">(only works for simple items: no sizes or required choices)</span></span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="mt-0.5 rounded border-editorial-line text-editorial-green focus:ring-editorial-green" />
                <span className="text-[12px] text-editorial-ink">Show on homepage menu carousel <span className="text-editorial-ink-faint">(needs a photo)</span></span>
              </label>
              {schools.length > 1 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-editorial-ink-faint mb-1.5">Location availability</p>
                  <p className="text-[12px] text-editorial-ink-faint mb-1.5">Check the locations that should see this item. Leave all unchecked = visible at every location.</p>
                  <div className="space-y-1.5">
                    {schools.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name={`school_${s.id}`} defaultChecked={item?.schoolIds.includes(s.id) ?? false} className="rounded border-editorial-line text-editorial-green focus:ring-editorial-green" />
                        <span className="text-[12px] text-editorial-ink">
                          {s.name}
                          <span className="text-[11px] uppercase tracking-wide ml-1.5 text-editorial-ink-faint">{s.locationType === "OFFICE" ? "Office" : "School"}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>

        <div className="border-t border-editorial-line px-5 py-3 space-y-2 bg-white">
          {error && <p role="alert" className="text-[12px] text-editorial-clay">{error}</p>}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer mr-auto">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-editorial-line text-editorial-green focus:ring-editorial-green" />
              <span className="text-[13px] font-semibold text-editorial-ink">Visible to customers</span>
            </label>
            {isNew && (
              <button type="button" disabled={busy} onClick={() => void submit(true)} className="px-4 py-2 rounded-full border border-editorial-line text-editorial-ink-soft text-[13px] font-semibold hover:bg-editorial-paper-2 disabled:opacity-50">
                Save &amp; add another
              </button>
            )}
            <button type="submit" disabled={busy} className="px-5 py-2 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep disabled:opacity-50">
              {busy ? "Saving…" : isNew ? "Save item" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
