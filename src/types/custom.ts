// Purpose: Object defefinition . This file has the definition of the objects that are added to `express.Request`

export type User = {
  userId?: string;
  userName?: string;
  userFullName?: string;
  email?: string;
  profileUrl?: string;
  userStatus?: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
};
