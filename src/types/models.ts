export interface User {
  uid: string;
  email: string;
  displayName: string | null;
  householdIds: string[];
}

export interface Household {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Date;
}

export interface HouseholdMember {
  userId: string;
  role: 'owner' | 'member' | 'viewer';
  joinedAt: Date;
}
