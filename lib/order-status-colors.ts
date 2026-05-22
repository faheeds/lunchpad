export type OrderStatus = "PAID" | "PENDING" | "REFUNDED" | "CANCELLED";

export type StatusColors = {
  label: string;
  bg: string;
  color: string;
};

export const getOrderStatusColors = (status: string): StatusColors => {
  const statusMap: Record<string, StatusColors> = {
    PAID: {
      label: "Confirmed",
      bg: "#DEE2CF", // editorial-sage
      color: "#2C4031", // editorial-green
    },
    PENDING: {
      label: "Pending",
      bg: "#F6EED9", // pale tan
      color: "#6E5C2C", // brownish
    },
    REFUNDED: {
      label: "Refunded",
      bg: "#F4E3DB", // pale brownish
      color: "#7C3D24", // brownish
    },
    CANCELLED: {
      label: "Cancelled",
      bg: "#F4E3DB", // pale brownish
      color: "#7C3D24", // brownish
    },
  };

  return statusMap[status] ?? statusMap.CANCELLED;
};
