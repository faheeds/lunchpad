import { NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    await assertAdminApiRequest();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Menu Items ────────────────────────────────────────────────────
  const itemsData = [
    ["Name *", "Price * ($)", "Description", "Category", "Active (yes/no)", "Required Choices (one per line, optional)", "Sizes (one per line: Name | price, optional)"],
    ["Smash Burger", "12.99", "Classic smash patty with American cheese", "Mains", "yes", "Beef\nCrispy Chicken\nGrilled Chicken\nVegan", ""],
    ["Caesar Salad", "9.99", "Romaine lettuce, croutons, parmesan", "Salads", "yes", "", ""],
    ["Chocolate Milk", "2.50", "", "Drinks", "yes", "", ""],
    ["Fruit Cup", "4.00", "Seasonal fresh fruit", "Sides", "yes", "", ""],
    ["Cheese Pizza", "12.99", "Mozzarella and tomato sauce", "Pizza", "yes", "", 'Small 7" | 12.99\nMedium 11" | 20.99\nLarge 16" | 26.99'],
  ];
  const itemsSheet = XLSX.utils.aoa_to_sheet(itemsData);
  itemsSheet["!cols"] = [
    { wch: 28 }, // Name
    { wch: 14 }, // Price
    { wch: 38 }, // Description
    { wch: 18 }, // Category
    { wch: 16 }, // Active
    { wch: 36 }, // Required Choices
    { wch: 34 }, // Sizes
  ];
  // Style header row bold (xlsx supports limited styling via !rows)
  XLSX.utils.book_append_sheet(wb, itemsSheet, "Menu Items");

  // ── Sheet 2: Options ───────────────────────────────────────────────────────
  const optionsData = [
    ["Item Name *", "Option Type * (ADD_ON or REMOVAL)", "Option Name *", "Price Delta ($)", "Is Default (yes/no)"],
    ["Smash Burger", "ADD_ON", "Extra Patty", "3.00", "no"],
    ["Smash Burger", "ADD_ON", "Add Bacon", "2.00", "no"],
    ["Smash Burger", "REMOVAL", "No Cheese", "0", "no"],
    ["Caesar Salad", "ADD_ON", "Grilled Chicken", "4.00", "no"],
    ["Caesar Salad", "REMOVAL", "No Croutons", "0", "no"],
  ];
  const optionsSheet = XLSX.utils.aoa_to_sheet(optionsData);
  optionsSheet["!cols"] = [
    { wch: 28 }, // Item Name
    { wch: 34 }, // Option Type
    { wch: 24 }, // Option Name
    { wch: 18 }, // Price Delta
    { wch: 22 }, // Is Default
  ];
  XLSX.utils.book_append_sheet(wb, optionsSheet, "Options");

  // ── Instructions Sheet ─────────────────────────────────────────────────────
  const instrData = [
    ["LunchPad Menu Upload Template — Instructions"],
    [""],
    ["SHEET 1: Menu Items"],
    ["  Name *          Required. The display name of the menu item."],
    ["  Price * ($)     Required. Price in dollars (e.g. 12.99)."],
    ["  Description     Optional. Short description shown to parents."],
    ["  Category        Optional. Used for grouping (e.g. Mains, Sides, Drinks)."],
    ["  Active          'yes' to make item visible, 'no' to hide it. Defaults to yes."],
    ["  Required Choices  Optional. Comma or newline separated list of pick-one options"],
    ["                    (e.g. Beef, Crispy Chicken, Vegan). Customers must pick exactly"],
    ["                    one to add the item to their cart. Leave blank if not needed."],
    ["  Sizes           Optional. One size per line as  Name | price  (e.g. Small 7\" | 12.99)."],
    ["                    The item then shows a size picker and the size's price replaces Price."],
    ["                    Price * is still required; use the lowest size price."],
    [""],
    ["SHEET 2: Options"],
    ["  Item Name *          Must exactly match a name from Sheet 1."],
    ["  Option Type *        Either ADD_ON (costs extra) or REMOVAL (remove ingredient)."],
    ["  Option Name *        Label shown to parent (e.g. 'No Cheese', 'Add Bacon')."],
    ["  Price Delta ($)      Amount to add/subtract from base price. Use 0 for free options."],
    ["  Is Default           'yes' if this option is pre-selected. Defaults to no."],
    [""],
    ["TIPS"],
    ["  - Delete the sample rows before uploading."],
    ["  - You can add as many items and options as you need."],
    ["  - Items with the same name as an existing menu item will be skipped."],
    ["  - Rows named like  Pizza - Small  /  Pizza - Large  in the same category are combined"],
    ["    into one item with sizes automatically (you can undo this in the preview)."],
    ["  - Columns are matched by their heading, so the order of columns can differ."],
  ];
  const instrSheet = XLSX.utils.aoa_to_sheet(instrData);
  instrSheet["!cols"] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, instrSheet, "Instructions");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="lunchpad-menu-template.xlsx"',
    },
  });
}
