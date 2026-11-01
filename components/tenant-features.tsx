"use client";

import { createContext, useContext } from "react";

type TenantFeatures = { weeklyPlanning: boolean };

const TenantFeaturesContext = createContext<TenantFeatures>({ weeklyPlanning: true });

/** Per-tenant feature switches for client components (set once in the root layout). */
export function TenantFeaturesProvider({ weeklyPlanning, children }: { weeklyPlanning: boolean; children: React.ReactNode }) {
  return <TenantFeaturesContext.Provider value={{ weeklyPlanning }}>{children}</TenantFeaturesContext.Provider>;
}

export function useTenantFeatures() {
  return useContext(TenantFeaturesContext);
}
