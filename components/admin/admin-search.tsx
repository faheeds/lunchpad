"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  orders: Array<{
    id: string;
    label: string;
    subtitle: string;
    status: string;
    schoolName: string;
    deliveryDate?: string;
  }>;
  menuItems: Array<{
    id: string;
    label: string;
    category?: string;
    price: number;
  }>;
  schools: Array<{
    id: string;
    label: string;
    type: string;
  }>;
  customers: Array<{
    id: string;
    label: string;
    email: string;
  }>;
}

type ResultItem =
  | { type: "order"; id: string; label: string; subtitle: string; status: string; schoolName: string; deliveryDate?: string }
  | { type: "menuItem"; id: string; label: string; category?: string; price: number }
  | { type: "school"; id: string; label: string; locationType: string }
  | { type: "customer"; id: string; label: string; email: string };

export function AdminSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Flatten results for keyboard navigation
  const flatResults: Array<{ category: string; item: ResultItem; index: number }> = [];
  if (results) {
    results.orders.forEach((order) => {
      const item: ResultItem = {
        type: "order",
        id: order.id,
        label: order.label,
        subtitle: order.subtitle,
        status: order.status,
        schoolName: order.schoolName,
        deliveryDate: order.deliveryDate,
      };
      flatResults.push({
        category: "Orders",
        item,
        index: flatResults.length,
      });
    });
    results.menuItems.forEach((menuItem) => {
      const item: ResultItem = {
        type: "menuItem",
        id: menuItem.id,
        label: menuItem.label,
        category: menuItem.category,
        price: menuItem.price,
      };
      flatResults.push({
        category: "Menu Items",
        item,
        index: flatResults.length,
      });
    });
    results.schools.forEach((school) => {
      const item: ResultItem = {
        type: "school",
        id: school.id,
        label: school.label,
        locationType: school.type,
      };
      flatResults.push({
        category: "Locations",
        item,
        index: flatResults.length,
      });
    });
    results.customers.forEach((customer) => {
      const item: ResultItem = {
        type: "customer",
        id: customer.id,
        label: customer.label,
        email: customer.email,
      };
      flatResults.push({
        category: "Customers",
        item,
        index: flatResults.length,
      });
    });
  }

  const hasResults = flatResults.length > 0;

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (!query.trim()) {
      setResults(null);
      setIsOpen(false);
      setSelectedIndex(-1);
      return;
    }

    setIsLoading(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error("Search failed");
        const data = (await response.json()) as SearchResult;
        setResults(data);
        setIsOpen(true);
        setSelectedIndex(-1);
      } catch (error) {
        console.error("Search error:", error);
        setResults(null);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || !hasResults) {
      if (e.key === "Enter" && query.trim()) {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % flatResults.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length);
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < flatResults.length) {
          navigateToResult(flatResults[selectedIndex].item);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  }

  function navigateToResult(item: ResultItem) {
    if (item.type === "order") {
      router.push(`/admin/orders?orderId=${item.id}`);
    } else if (item.type === "menuItem") {
      router.push(`/admin/menu#item-${item.id}`);
    } else if (item.type === "school") {
      router.push(`/admin/locations?schoolId=${item.id}`);
    } else if (item.type === "customer") {
      router.push(`/admin/orders?customerId=${item.id}`);
    }
    setQuery("");
    setResults(null);
    setIsOpen(false);
  }

  function handleResultClick(item: ResultItem) {
    navigateToResult(item);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search orders, menu, locations, customers..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (hasResults) setIsOpen(true);
        }}
        className="w-full px-3 py-1.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-transparent bg-white"
        style={{
          borderColor: isOpen ? "#fca5ac" : "#e2e8f0",
        }}
      />

      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-red-400 rounded-full animate-spin" />
        </div>
      )}

      {isOpen && hasResults && (
        <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {results?.orders && results.orders.length > 0 && (
            <div>
              <div className="sticky top-0 px-3 py-2 bg-slate-50 border-b border-slate-100">
                <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Orders</h3>
              </div>
              {results.orders.map((order) => {
                const itemIndex = flatResults.findIndex(
                  (r) => r.item.type === "order" && r.item.id === order.id
                );
                const isSelected = selectedIndex === itemIndex;
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => handleResultClick({
                      type: "order",
                      id: order.id,
                      label: order.label,
                      subtitle: order.subtitle,
                      status: order.status,
                      schoolName: order.schoolName,
                      deliveryDate: order.deliveryDate,
                    })}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    className="w-full text-left px-3 py-2 text-[13px] border-b border-slate-50 last:border-b-0 transition"
                    style={{
                      background: isSelected ? "#fef3c7" : "transparent",
                    }}
                  >
                    <div className="font-medium text-slate-900">{order.label}</div>
                    <div className="text-[12px] text-slate-500 flex justify-between">
                      <span>{order.subtitle}</span>
                      <span>{order.schoolName}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {results?.menuItems && results.menuItems.length > 0 && (
            <div>
              <div className="sticky top-0 px-3 py-2 bg-slate-50 border-b border-slate-100">
                <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Menu Items</h3>
              </div>
              {results.menuItems.map((item) => {
                const itemIndex = flatResults.findIndex(
                  (r) => r.item.type === "menuItem" && r.item.id === item.id
                );
                const isSelected = selectedIndex === itemIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleResultClick({
                      type: "menuItem",
                      id: item.id,
                      label: item.label,
                      category: item.category,
                      price: item.price,
                    })}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    className="w-full text-left px-3 py-2 text-[13px] border-b border-slate-50 last:border-b-0 transition"
                    style={{
                      background: isSelected ? "#fef3c7" : "transparent",
                    }}
                  >
                    <div className="font-medium text-slate-900">{item.label}</div>
                    <div className="text-[12px] text-slate-500 flex justify-between">
                      <span>{item.category || "Uncategorized"}</span>
                      <span>${(item.price / 100).toFixed(2)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {results?.schools && results.schools.length > 0 && (
            <div>
              <div className="sticky top-0 px-3 py-2 bg-slate-50 border-b border-slate-100">
                <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Locations</h3>
              </div>
              {results.schools.map((school) => {
                const itemIndex = flatResults.findIndex(
                  (r) => r.item.type === "school" && r.item.id === school.id
                );
                const isSelected = selectedIndex === itemIndex;
                return (
                  <button
                    key={school.id}
                    type="button"
                    onClick={() => handleResultClick({
                      type: "school",
                      id: school.id,
                      label: school.label,
                      locationType: school.type,
                    })}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    className="w-full text-left px-3 py-2 text-[13px] border-b border-slate-50 last:border-b-0 transition"
                    style={{
                      background: isSelected ? "#fef3c7" : "transparent",
                    }}
                  >
                    <div className="font-medium text-slate-900">{school.label}</div>
                    <div className="text-[12px] text-slate-500">{school.type === "SCHOOL" ? "School" : "Office"}</div>
                  </button>
                );
              })}
            </div>
          )}

          {results?.customers && results.customers.length > 0 && (
            <div>
              <div className="sticky top-0 px-3 py-2 bg-slate-50 border-b border-slate-100">
                <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Customers</h3>
              </div>
              {results.customers.map((customer) => {
                const itemIndex = flatResults.findIndex(
                  (r) => r.item.type === "customer" && r.item.id === customer.id
                );
                const isSelected = selectedIndex === itemIndex;
                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => handleResultClick({
                      type: "customer",
                      id: customer.id,
                      label: customer.label,
                      email: customer.email,
                    })}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    className="w-full text-left px-3 py-2 text-[13px] border-b border-slate-50 last:border-b-0 transition"
                    style={{
                      background: isSelected ? "#fef3c7" : "transparent",
                    }}
                  >
                    <div className="font-medium text-slate-900">{customer.label}</div>
                    <div className="text-[12px] text-slate-500">{customer.email}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
