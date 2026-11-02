"use client";

import { createContext, useContext } from "react";

type TenantFeatures = { weeklyPlanning: boolean; landingV2: boolean; schoolStyle: boolean };

const TenantFeaturesContext = createContext<TenantFeatures>({ weeklyPlanning: true, landingV2: false, schoolStyle: true });

/** Per-tenant feature switches for client components (set once in the root layout). */
export function TenantFeaturesProvider({
  weeklyPlanning,
  landingV2 = false,
  schoolStyle = true,
  children,
}: {
  weeklyPlanning: boolean;
  landingV2?: boolean;
  /** School operators keep "Order lunch"; everyone else gets "Order now". */
  schoolStyle?: boolean;
  children: React.ReactNode;
}) {
  return <TenantFeaturesContext.Provider value={{ weeklyPlanning, landingV2, schoolStyle }}>{children}</TenantFeaturesContext.Provider>;
}

export function useTenantFeatures() {
  return useContext(TenantFeaturesContext);
}
