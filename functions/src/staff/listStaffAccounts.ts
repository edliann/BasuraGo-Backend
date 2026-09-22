import {firestore} from "../firebaseAdmin";

export interface StaffAccount {
  userId: string;
  fullName: string;
  email: string;
  role: "admin";
  status: "pending" | "active" | "suspended" | "disabled";
  createdAt: string | null;
}

/**
 * Lists BasuraGo staff accounts.
 *
 * @return {Promise<StaffAccount[]>} The staff accounts.
 */
export async function listStaffAccounts(): Promise<
  StaffAccount[]
  > {
  const snapshot = await firestore
    .collection("users")
    .where("role", "==", "admin")
    .get();

  return snapshot.docs.map((document) => {
    const data = document.data();

    const createdAt =
      data.createdAt?.toDate?.()?.toISOString?.() ?? null;

    return {
      userId: document.id,
      fullName:
        typeof data.fullName === "string" ?
          data.fullName :
          "",
      email:
        typeof data.email === "string" ?
          data.email :
          "",
      role: "admin",
      status:
        data.status === "pending" ||
        data.status === "active" ||
        data.status === "suspended" ||
        data.status === "disabled" ?
          data.status :
          "disabled",
      createdAt,
    };
  });
}
