import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { Order, OrderItem, School, Student, DeliveryDate } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

type LabelOrder = Order & {
  school: School;
  student: Student;
  deliveryDate: DeliveryDate;
  items: OrderItem[];
};

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 10,
    fontFamily: "Helvetica"
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  label: {
    width: "48%",
    minHeight: 140,
    border: "1 solid #d0d7de",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10
  },
  title: {
    fontSize: 14,
    fontWeight: 700
  },
  meta: {
    marginTop: 4,
    color: "#555"
  },
  alert: {
    marginTop: 8,
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#fde7e7",
    color: "#7a271a"
  }
});

export function getLabelMetaLines(order: LabelOrder): { line1: string; line2: string | null } {
  const isOffice = order.school.locationType === "OFFICE";
  if (isOffice) {
    return { line1: order.school.name, line2: null };
  }
  const teacher = order.student.teacherName || "Teacher n/a";
  const room = order.student.classroom ? ` | Room ${order.student.classroom}` : "";
  return {
    line1: `Grade ${order.student.grade} | ${order.school.name}`,
    line2: `${teacher}${room}`,
  };
}

function LabelCard({ order }: { order: LabelOrder }) {
  const allergy = order.items.map((item) => item.allergyNotes).find(Boolean) || order.student.allergyNotes;
  const itemLines = order.items.map((item) => ({
    name: item.itemNameSnapshot,
    additions: item.additions.length ? item.additions.join(", ") : "None",
    removals: item.removals.length ? item.removals.join(", ") : "None"
  }));
  const isLate = order.deliveryDate.originalCutoffAt && new Date(order.createdAt) > new Date(order.deliveryDate.originalCutoffAt);

  return (
    <View style={styles.label}>
      <>
        <Text style={styles.title}>{order.student.studentName}</Text>
        {(() => {
          const meta = getLabelMetaLines(order);
          return (
            <>
              <Text style={styles.meta}>{meta.line1}</Text>
              {meta.line2 !== null ? <Text style={styles.meta}>{meta.line2}</Text> : null}
            </>
          );
        })()}
        {itemLines.map((item, index) => (
          <View key={`${order.id}-${index}`} style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 12 }}>{item.name}</Text>
            <Text>Add: {item.additions}</Text>
            <Text>No: {item.removals}</Text>
          </View>
        ))}
        <Text>Order: {order.orderNumber}</Text>
        {isLate ? <Text style={styles.alert}>LATE ORDER</Text> : null}
        {allergy ? <Text style={styles.alert}>Allergy / diet: {allergy}</Text> : null}
      </>
    </View>
  );
}

function LabelsDocument({ orders }: { orders: LabelOrder[] }) {
  const titleDate =
    orders[0] &&
    formatInTimeZone(orders[0].deliveryDate.deliveryDate, orders[0].school.timezone, "EEEE, MMM d");

  return (
    <Document title={`Labels ${titleDate ?? ""}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={{ marginBottom: 12, fontSize: 16 }}>Student labels {titleDate ? `- ${titleDate}` : ""}</Text>
        <View style={styles.grid}>
          {orders.map((order) => (
            <LabelCard key={order.id} order={order} />
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function generateLabelsPdfBuffer(orders: LabelOrder[]) {
  return renderToBuffer(<LabelsDocument orders={orders} />);
}

export function mapOrderToLabelRows(orders: LabelOrder[]) {
  return orders.map((order) => {
    const isLate = order.deliveryDate.originalCutoffAt && new Date(order.createdAt) > new Date(order.deliveryDate.originalCutoffAt);
    const allergy = order.items.map((item) => item.allergyNotes).find(Boolean) ?? order.student.allergyNotes ?? "";
    const alert = [isLate ? "LATE ORDER" : "", allergy].filter(Boolean).join(" | ");
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      studentName: order.student.studentName,
      grade: order.student.grade,
      school: order.school.name,
      teacher: order.student.teacherName ?? "",
      classroom: order.student.classroom ?? "",
      itemName: order.items.map((item) => item.itemNameSnapshot).join(" | "),
      additions: order.items.flatMap((item) => item.additions),
      removals: order.items.flatMap((item) => item.removals),
      alert,
    };
  });
}
