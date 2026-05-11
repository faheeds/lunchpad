export type OrderCartItemInput = {
  menuItemId: string;
  choice?: string;
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
