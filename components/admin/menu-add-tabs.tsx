"use client";

import { useState } from "react";
import { BulkMenuUpload } from "@/components/admin/bulk-menu-upload";
import { MenuUrlImport } from "@/components/admin/menu-url-import";
import { ImageUpload } from "@/components/admin/image-upload";
import { DietaryTagsPicker } from "@/components/admin/dietary-tags-picker";
import type { MenuItem } from "@prisma/client";

type TabId = "add" | "option" | "url" | "bulk";

interface MenuAddTabsProps {
  items: MenuItem[];
  createMenuItem: (formData: FormData) => Promise<void>;
  createMenuOption: (formData: FormData) => Promise<void>;
}

export function MenuAddTabs({
  items,
  createMenuItem,
  createMenuOption,
}: MenuAddTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("add");

  const tabs: Array<{ id: TabId; label: string; icon?: string }> = [
    { id: "add", label: "Add item" },
    { id: "option", label: "Add option" },
    { id: "url", label: "Import from URL", icon: "🪄" },
    { id: "bulk", label: "Bulk upload", icon: "⬆" },
  ];

  return (
    <div className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
      {/* Tab bar */}
      <div className="border-b border-editorial-line -mx-1">
        <div className="flex gap-1 px-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2.5 text-[12px] font-semibold whitespace-nowrap border-b-2 transition ${
                  isActive
                    ? "border-editorial-green text-editorial-green"
                    : "border-transparent text-editorial-ink-faint hover:text-editorial-ink-soft"
                }`}
              >
                {tab.icon && <span className="mr-1">{tab.icon}</span>}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab panels */}
      <div className="px-4 pb-4 pt-3">
        {/* Add item */}
        {activeTab === "add" && (
          <div id="panel-add" role="tabpanel" aria-labelledby="tab-add">
            <form action={createMenuItem} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
              <div>
                <ImageUpload name="imageUrl" label="Photo" aspect="square" />
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[12px] text-editorial-ink-soft mb-1 block">
                    Item name
                  </label>
                  <input
                    name="name"
                    placeholder="e.g. Crispy Chicken Sandwich"
                    required
                    className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-editorial-ink-soft mb-1 block">
                    Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-editorial-ink-faint pointer-events-none">
                      $
                    </span>
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="12.99"
                      required
                      className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] pl-6 pr-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label className="text-[12px] text-editorial-ink-soft mb-1 block">
                Description
              </label>
              <input
                name="description"
                placeholder="A short, mouth-watering description"
                className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
              />
            </div>
            <div>
              <label className="text-[12px] text-editorial-ink-soft mb-1 block">
                Category <span className="text-editorial-ink-faint font-normal">(optional)</span>
              </label>
              <input
                name="category"
                placeholder="e.g. Sandwiches, Salads, Pizza"
                className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
              />
            </div>
            <div>
              <label className="text-[12px] text-editorial-ink-soft mb-1 block">
                Dietary tags
              </label>
              <DietaryTagsPicker />
            </div>
            <div>
              <label className="text-[12px] text-editorial-ink-soft mb-1 block">
                Required choices{" "}
                <span className="text-editorial-ink-faint font-normal">(optional — pick-one)</span>
              </label>
              <textarea
                name="requiredChoices"
                rows={3}
                placeholder={"One per line, e.g.\nBeef\nCrispy Chicken\nVegan"}
                className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] px-3 py-2 leading-snug resize-y font-mono focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
              />
              <p className="text-[11px] text-editorial-ink-faint mt-1">
                Customers must pick exactly one to add this item to their cart. Leave blank if not
                needed.
              </p>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-editorial-ink-soft cursor-pointer">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked
                className="rounded border-editorial-line text-editorial-green focus:ring-editorial-green"
              />
              Active (visible to customers)
            </label>
            <button
              type="submit"
              className="w-full py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition"
            >
              Create item
            </button>
          </form>
          </div>
        )}

        {/* Add option */}
        {activeTab === "option" && (
          <div id="panel-option" role="tabpanel" aria-labelledby="tab-option">
          <form action={createMenuOption} className="space-y-2">
            <div>
              <label className="text-[12px] text-editorial-ink-soft mb-1 block">
                Menu item
              </label>
              <select
                name="menuItemId"
                className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[12px] text-editorial-ink-soft mb-1 block">
                  Option name
                </label>
                <input
                  name="name"
                  placeholder="e.g. Extra cheese"
                  required
                  className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                />
              </div>
              <div>
                <label className="text-[12px] text-editorial-ink-soft mb-1 block">Type</label>
                <select
                  name="optionType"
                  className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                >
                  <option value="ADD_ON">Add-on</option>
                  <option value="REMOVAL">Removal</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] text-editorial-ink-soft mb-1 block">
                  Price delta (cents, 0 = free)
                </label>
                <input
                  name="priceDeltaCents"
                  type="number"
                  defaultValue="0"
                  required
                  className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                />
              </div>
              <div>
                <label className="text-[12px] text-editorial-ink-soft mb-1 block">
                  Sort order
                </label>
                <input
                  name="sortOrder"
                  type="number"
                  defaultValue="0"
                  required
                  className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] px-3 py-2 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold hover:bg-editorial-green-deep transition"
            >
              Add option
            </button>
          </form>
          </div>
        )}

        {/* Import from URL */}
        {activeTab === "url" && <div id="panel-url" role="tabpanel" aria-labelledby="tab-url"><MenuUrlImport /></div>}

        {/* Bulk upload */}
        {activeTab === "bulk" && <div id="panel-bulk" role="tabpanel" aria-labelledby="tab-bulk"><BulkMenuUpload /></div>}
      </div>
    </div>
  );
}
