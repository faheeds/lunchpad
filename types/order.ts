export type OrderCartItemInput = {
  menuItemId: string;
  choice?: string;
  /** Size name when the menu item has size variants. Optional for
   *  items without sizes; required (validated server-side) when the
   *  item declared sizes. */
  size?: string;
  additions: string[];
  removals: string[];
};

export type OrderDraftInput = {
  parentName: string;
  parentEmail: string;
  schoolId: string;
  deliveryDateId: string;
  parentChildId?: string;
  studentName: string;
  grade: string;
  teacherName?: string;
  classroom?: string;
  cartItems: OrderCartItemInput[];
  allergyNotes?: string;
  dietaryNotes?: string;
  specialInstructions?: string;
  /** Optional promo code the customer typed at checkout. Whitespace
   *  irrelevant — engine trims + uppercases. Auto discounts apply
   *  regardless of this field. */
  discountCode?: string;
};
