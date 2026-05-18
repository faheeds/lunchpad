"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SearchResult = {
  orders: Array<{ id: string; orderNumber: string; parentName: string; deliveryDateId: string }>;
  menuItems: Array<{ id: string; name: string }>;
  schools: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; name: string | null; email: string }>;
};

export function AdminSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Flatten results for keyboard navigation
  const flatResults = results
    ? [
        ...results.orders.map((o) => ({ type: "order" as const, id: o.id, label: `${o.orderNumber} — ${o.parentName}`, data: o })),
        ...results.menuItems.map((m) => ({ type: "menuItem" as const, id: m.id, label: m.name, data: m })),
        ...results.schools.map((s) => ({ type: "school" as const, id: s.id, label: s.name, data: s })),
        ...results.customers.map((c) => ({ type: "customer" as const, id: c.id, label: `${c.name || c.email}`, data: c })),
      ]
    : [];

  const handleSearch = (value: string) => {
    setQuery(value);
    setSelectedIndex(-1);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (value.trim().length === 0) {
      setResults(null);
      setIsOpen(false);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(value)}`);
        if (response.ok) {
          const data: SearchResult = await response.json();
          setResults(data);
          setIsOpen(true);
        }
      } catch (error) {
        console.error("Search failed:", error);
      }
    }, 300);
  };

  const handleSelect = (item: (typeof flatResults)[0]) => {
    switch (item.type) {
      case "order":
        router.push(`/admin/orders?q=${encodeURIComponent(item.data.orderNumber)}`);
        break;
      case "menuItem":
        router.push(`/admin/menu#item-${item.data.id}`);
        break;
      case "school":
        router.push(`/admin/delivery-dates?schoolId=${item.data.id}`);
        break;
      case "customer":
        router.push(`/admin/orders?q=${encodeURIComponent(item.data.email)}`);
        break;
    }
    setIsOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < flatResults.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < flatResults.length) {
          handleSelect(flatResults[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const hasResults =
    (results?.orders.length ?? 0) > 0 ||
    (results?.menuItems.length ?? 0) > 0 ||
    (results?.schools.length ?? 0) > 0 ||
    (results?.customers.length ?? 0) > 0;

  return (
    <div className="relative flex-1 max-w-xs">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search orders, menu, schools..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => isOpen || setIsOpen(query.length > 0)}
        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-[12px] placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-700 focus:border-brand-700"
        aria-autocomplete="list"
        aria-expanded={isOpen}
      />

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
        >
          {!hasResults ? (
            <div className="px-3 py-2 text-[11px] text-slate-400">No results found</div>
          ) : (
            <div className="py-1">
              {results?.orders && results.orders.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Orders
                  </div>
                  {results.orders.map((order, idx) => {
                    const globalIdx = idx;
                    const isSelected = selectedIndex === globalIdx;
                    return (
                      <button
                        key={order.id}
                        onClick={() =>
                          handleSelect({
                            type: "order",
                            id: order.id,
                            label: `${order.orderNumber} — ${order.parentName}`,
                            data: order,
                          })
                        }
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={`w-full text-left px-3 py-1.5 text-[12px] transition ${
                          isSelected
                            ? "bg-brand-50 text-brand-700"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <div className="font-medium">{order.orderNumber}</div>
                        <div className="text-[11px] text-slate-500">{order.parentName}</div>
                      </button>
                    );
                  })}
                </div>
              )}
              {results?.menuItems && results.menuItems.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Menu Items
                  </div>
                  {results.menuItems.map((item, idx) => {
                    const globalIdx = (results?.orders.length ?? 0) + idx;
                    const isSelected = selectedIndex === globalIdx;
                    return (
                      <button
                        key={item.id}
                        onClick={() =>
                          handleSelect({
                            type: "menuItem",
                            id: item.id,
                            label: item.name,
                            data: item,
                          })
                        }
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={`w-full text-left px-3 py-1.5 text-[12px] transition ${
                          isSelected
                            ? "bg-brand-50 text-brand-700"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        {item.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {results?.schools && results.schools.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Schools
                  </div>
                  {results.schools.map((school, idx) => {
                    const globalIdx =
                      (results?.orders.length ?? 0) +
                      (results?.menuItems.length ?? 0) +
                      idx;
                    const isSelected = selectedIndex === globalIdx;
                    return (
                      <button
                        key={school.id}
                        onClick={() =>
                          handleSelect({
                            type: "school",
                            id: school.id,
                            label: school.name,
                            data: school,
                          })
                        }
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={`w-full text-left px-3 py-1.5 text-[12px] transition ${
                          isSelected
                            ? "bg-brand-50 text-brand-700"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        {school.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {results?.customers && results.customers.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Customers
                  </div>
                  {results.customers.map((customer, idx) => {
                    const globalIdx =
                      (results?.orders.length ?? 0) +
                      (results?.menuItems.length ?? 0) +
                      (results?.schools.length ?? 0) +
                      idx;
                    const isSelected = selectedIndex === globalIdx;
                    return (
                      <button
                        key={customer.id}
                        onClick={() =>
                          handleSelect({
                            type: "customer",
                            id: customer.id,
                            label: customer.name || customer.email,
                            data: customer,
                          })
                        }
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={`w-full text-left px-3 py-1.5 text-[12px] transition ${
                          isSelected
                            ? "bg-brand-50 text-brand-700"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <div className="font-medium">{customer.name || customer.email}</div>
                        {customer.name && (
                          <div className="text-[11px] text-slate-500">{customer.email}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
