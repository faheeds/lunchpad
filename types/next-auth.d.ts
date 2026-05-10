import "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;                  // "ADMIN" | "PARENT"
      adminRole?: string;             // "OWNER" | "MANAGER" | "STAFF"
      parentUserId?: string;
      adminUserId?: string;
      restaurantId?: string;          // tenant id for admins
      parentRestaurantId?: string;    // tenant id for parents (per-tenant scoping)
    };
  }

  interface User {
    role?: string;
    adminRole?: string;
    restaurantId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    adminRole?: string;
    parentUserId?: string;
    adminUserId?: string;
    restaurantId?: string;
    parentRestaurantId?: string;
  }
}
