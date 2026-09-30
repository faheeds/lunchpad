import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { Order, OrderItem, School, Student, DeliveryDate } from "@prisma/client";
import { STANDARD_GRADES } from "@/lib/grades";

type LabelOrder = Order & {
  school: School;
  student: Student;
  deliveryDate: DeliveryDate;
  items: OrderItem[];
};

// ---------------------------------------------------------------------------
// Delivery-route ordering
//
// The driver drops food building-by-building, and within a building
// level-by-level (e.g. a toddler/preschool wing serving ages 2-5, then an
// elementary wing serving 6+). Grades aren't alphabetical order ("1st Grade"
// sorts before "Pre-K" as a string), so we sort by each school's own
// configured grade order (School.grades, the same list that drives the
// admin dropdowns) when available, falling back to the generic K-12 order
// for schools that haven't configured one. This is the default label order
// everywhere labels are produced -- the print page, the PDF, and JSON --
// so drivers always get one location fully sorted before the next.
// ---------------------------------------------------------------------------
function gradeSortIndex(grade: string, configuredGrades: string[]): number {
  const configuredIndex = configuredGrades.indexOf(grade);
  if (configuredIndex !== -1) return configuredIndex;
  const standardIndex = STANDARD_GRADES.indexOf(grade);
  if (standardIndex !== -1) return configuredGrades.length + standardIndex;
  // Unrecognized grade values (e.g. free-typed text) sort last within their
  // school rather than disappearing or crashing the sort.
  return configuredGrades.length + STANDARD_GRADES.length;
}

function sortLabelOrders<T extends LabelOrder>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    // Group by location first, so the driver finishes one building before
    // moving to the next.
    const schoolCompare = a.school.name.localeCompare(b.school.name);
    if (schoolCompare !== 0) return schoolCompare;
    // Within a location, order by grade/level rather than alphabetically.
    const gradeCompare =
      gradeSortIndex(a.student.grade, a.school.grades) - gradeSortIndex(b.student.grade, b.school.grades);
    if (gradeCompare !== 0) return gradeCompare;
    // Stable, easy-to-scan tiebreaker within the same grade.
    return a.student.studentName.localeCompare(b.student.studentName);
  });
}

// ---------------------------------------------------------------------------
// Sheet geometry
//
// Matches the actual sheet in use: US Letter (8.5" x 11"), 10-up, 2" x 4"
// labels, 2 columns x 5 rows (e.g. "AveneMark 5000 Labels (500 Sheets) - 2x4
// Shipping Address Labels - 10-Up"). This is the same layout as the
// industry-standard Avery 5163/8163-compatible template that virtually all
// generic 2x4 10-up label sheets follow, so margins/gaps below use that
// spec's standard values. If a test print doesn't line up with your
// physical sheet, adjust marginX/marginY/columnGap here -- everything else
// (grid math, font-fit) derives from them automatically.
// All units are PDF points (72pt = 1in).
// ---------------------------------------------------------------------------
const IN = 72;

const SHEET = {
  pageWidth: 8.5 * IN, // US Letter
  pageHeight: 11 * IN, // US Letter
  columns: 2,
  rows: 5,
  marginX: 0.15625 * IN, // outer left/right margin (5/32")
  marginY: 0.5 * IN, // outer top/bottom margin
  columnGap: 0.1875 * IN, // gap between the two columns (3/16")
  rowGap: 0, // gap between rows (0 = rows butt together, standard for this template)
};

const labelWidth =
  (SHEET.pageWidth - 2 * SHEET.marginX - (SHEET.columns - 1) * SHEET.columnGap) / SHEET.columns;
const labelHeight =
  (SHEET.pageHeight - 2 * SHEET.marginY - (SHEET.rows - 1) * SHEET.rowGap) / SHEET.rows;

const LABELS_PER_PAGE = SHEET.columns * SHEET.rows;
const LABEL_PADDING = 8;
const LINE_HEIGHT = 1.15;

// Base (unscaled) font sizes -- used as-is when a label's content is short
// enough to fit at full size, then scaled down together as a unit when it
// isn't (see fitLabelContent below).
const BASE_FONT = {
  title: 11,
  meta: 7.5,
  itemName: 8.5,
  itemDetail: 7,
  orderNumber: 6.5,
  alert: 7,
};

const MIN_SCALE = 0.55;
const SCALE_STEP = 0.05;

const styles = StyleSheet.create({
  page: {
    paddingTop: SHEET.marginY,
    paddingBottom: SHEET.marginY,
    paddingLeft: SHEET.marginX,
    paddingRight: SHEET.marginX,
    fontFamily: "Helvetica",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  label: {
    width: labelWidth,
    height: labelHeight,
    border: "0.5 solid #d0d7de",
    borderRadius: 4,
    padding: LABEL_PADDING,
    overflow: "hidden",
  },
  meta: {
    color: "#555",
  },
  alert: {
    marginTop: 3,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
    backgroundColor: "#fde7e7",
    color: "#7a271a",
  },
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

type ItemLine = { name: string; additions: string; removals: string };

function getItemLines(order: LabelOrder): ItemLine[] {
  return order.items.map((item) => ({
    name: item.itemNameSnapshot,
    additions: item.additions.length ? item.additions.join(", ") : "None",
    removals: item.removals.length ? item.removals.join(", ") : "None",
  }));
}

function getAllergyText(order: LabelOrder): string {
  return order.items.map((item) => item.allergyNotes).find(Boolean) || order.student.allergyNotes || "";
}

function getIsLate(order: LabelOrder): boolean {
  return Boolean(
    order.deliveryDate.originalCutoffAt && new Date(order.createdAt) > new Date(order.deliveryDate.originalCutoffAt)
  );
}

// Rough Helvetica average-character-width heuristic (no text-measurement API
// is available at PDF-generation time), used only to estimate how many
// lines a string will wrap to at a given font size and box width.
function estimateLines(text: string, fontSize: number, boxWidth: number): number {
  if (!text) return 0;
  const avgCharWidth = fontSize * 0.52;
  const charsPerLine = Math.max(1, Math.floor(boxWidth / avgCharWidth));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

type LabelLayout = {
  scale: number;
  font: typeof BASE_FONT;
  meta: { line1: string; line2: string | null };
  itemLines: ItemLine[];
  allergy: string;
  isLate: boolean;
};

// Picks the largest font-size scale (in SCALE_STEP increments down to
// MIN_SCALE) at which this order's full content is estimated to fit inside
// one fixed-size label. This is what lets a label with one item print at
// full size while a label with four items plus an allergy note shrinks
// uniformly to still fit the same physical sticker, instead of overflowing
// or being cut off.
function fitLabelContent(order: LabelOrder): LabelLayout {
  const contentWidth = labelWidth - 2 * LABEL_PADDING;
  const availableHeight = labelHeight - 2 * LABEL_PADDING;
  const meta = getLabelMetaLines(order);
  const itemLines = getItemLines(order);
  const allergy = getAllergyText(order);
  const isLate = getIsLate(order);

  let best: { scale: number; font: typeof BASE_FONT } = { scale: MIN_SCALE, font: scaleFont(MIN_SCALE) };

  for (let scale = 1; scale >= MIN_SCALE - 1e-9; scale -= SCALE_STEP) {
    const font = scaleFont(scale);
    let height = font.title * LINE_HEIGHT;
    height += (meta.line2 !== null ? 2 : 1) * font.meta * LINE_HEIGHT;

    for (const item of itemLines) {
      height += 3; // small gap above each item block
      height += estimateLines(item.name, font.itemName, contentWidth) * font.itemName * LINE_HEIGHT;
      height += estimateLines(`Add: ${item.additions}`, font.itemDetail, contentWidth) * font.itemDetail * LINE_HEIGHT;
      height += estimateLines(`No: ${item.removals}`, font.itemDetail, contentWidth) * font.itemDetail * LINE_HEIGHT;
    }

    height += 3 + font.orderNumber * LINE_HEIGHT;

    if (isLate) {
      height += 3 + estimateLines("LATE ORDER", font.alert, contentWidth) * font.alert * LINE_HEIGHT;
    }
    if (allergy) {
      height += 3 + estimateLines(`Allergy / diet: ${allergy}`, font.alert, contentWidth) * font.alert * LINE_HEIGHT;
    }

    best = { scale, font };
    if (height <= availableHeight) {
      break;
    }
  }

  return { scale: best.scale, font: best.font, meta, itemLines, allergy, isLate };
}

function scaleFont(scale: number): typeof BASE_FONT {
  return {
    title: BASE_FONT.title * scale,
    meta: BASE_FONT.meta * scale,
    itemName: BASE_FONT.itemName * scale,
    itemDetail: BASE_FONT.itemDetail * scale,
    orderNumber: BASE_FONT.orderNumber * scale,
    alert: BASE_FONT.alert * scale,
  };
}

type CellStyle = { marginRight: number; marginBottom: number };

function LabelCard({ order, cellStyle }: { order: LabelOrder; cellStyle: CellStyle }) {
  const { font, meta, itemLines, allergy, isLate } = fitLabelContent(order);

  return (
    <View style={[styles.label, cellStyle]} wrap={false}>
      <Text style={{ fontSize: font.title, fontWeight: 700 }}>{order.student.studentName}</Text>
      <Text style={[styles.meta, { fontSize: font.meta, marginTop: 2 }]}>{meta.line1}</Text>
      {meta.line2 !== null ? (
        <Text style={[styles.meta, { fontSize: font.meta }]}>{meta.line2}</Text>
      ) : null}
      {itemLines.map((item, index) => (
        <View key={`${order.id}-${index}`} style={{ marginTop: 3 }} wrap={false}>
          <Text style={{ fontSize: font.itemName, fontWeight: 700 }}>{item.name}</Text>
          <Text style={{ fontSize: font.itemDetail }}>Add: {item.additions}</Text>
          <Text style={{ fontSize: font.itemDetail }}>No: {item.removals}</Text>
        </View>
      ))}
      <Text style={{ fontSize: font.orderNumber, marginTop: 3, color: "#555" }}>Order: {order.orderNumber}</Text>
      {isLate ? <Text style={[styles.alert, { fontSize: font.alert }]}>LATE ORDER</Text> : null}
      {allergy ? (
        <Text style={[styles.alert, { fontSize: font.alert }]}>Allergy / diet: {allergy}</Text>
      ) : null}
    </View>
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function LabelsPage({ orders }: { orders: LabelOrder[] }) {
  return (
    <Page size="LETTER" style={styles.page}>
      <View style={styles.grid}>
        {Array.from({ length: LABELS_PER_PAGE }).map((_, i) => {
          const order = orders[i];
          const col = i % SHEET.columns;
          const row = Math.floor(i / SHEET.columns);
          const cellStyle: CellStyle = {
            marginRight: col < SHEET.columns - 1 ? SHEET.columnGap : 0,
            marginBottom: row < SHEET.rows - 1 ? SHEET.rowGap : 0,
          };
          // Empty placeholder cells (last page, partial sheet) keep every
          // printed label aligned to its physical sticker position instead
          // of the grid reflowing to fill the gap. No border/fill here --
          // it's blank sticker backing, not a drawn box.
          if (!order) {
            return (
              <View
                key={`empty-${i}`}
                style={{ width: labelWidth, height: labelHeight, ...cellStyle }}
              />
            );
          }
          return <LabelCard key={order.id} order={order} cellStyle={cellStyle} />;
        })}
      </View>
    </Page>
  );
}

function LabelsDocument({ orders }: { orders: LabelOrder[] }) {
  const pages = chunk(orders, LABELS_PER_PAGE);
  return (
    <Document title="Student labels">
      {pages.length > 0 ? (
        pages.map((pageOrders, index) => <LabelsPage key={index} orders={pageOrders} />)
      ) : (
        <Page size="LETTER" style={styles.page} />
      )}
    </Document>
  );
}

export async function generateLabelsPdfBuffer(orders: LabelOrder[]) {
  return renderToBuffer(<LabelsDocument orders={sortLabelOrders(orders)} />);
}

export function mapOrderToLabelRows(orders: LabelOrder[]) {
  return sortLabelOrders(orders).map((order) => {
    const isLate = getIsLate(order);
    const allergy = getAllergyText(order);
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
