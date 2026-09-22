import {getAuth} from "firebase-admin/auth";
import {FieldValue} from "firebase-admin/firestore";

import {firestore} from "../firebaseAdmin";

export type StaffStatus =
  | "active"
  | "suspended"
  | "disabled";

const VALID_STATUSES: StaffStatus[] = [
  "active",
  "suspended",
  "disabled",
];

/**
 * Updates the status of a staff account.
 *
 * @param {string} userId The staff account user ID.
 * @param {StaffStatus} status The new staff account status.
 * @return {Promise<void>} Resolves when the status is updated.
 */
export async function updateStaffStatus(
  userId: string,
  status: StaffStatus,
): Promise<void> {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error("Invalid staff account status.");
  }

  const auth = getAuth();

  const targetUser = await auth.getUser(userId);

  // Never allow a Super Admin account to be modified
  // through staff management.
  if (targetUser.customClaims?.superAdmin === true) {
    throw new Error(
      "Super Admin accounts cannot be modified through Staff Management.",
    );
  }

  const userRef = firestore.collection("users").doc(userId);
  const userSnapshot = await userRef.get();

  if (!userSnapshot.exists) {
    throw new Error("Staff account was not found.");
  }

  const userData = userSnapshot.data();

  if (userData?.role !== "admin") {
    throw new Error(
      "The selected account is not a staff account.",
    );
  }

  const shouldDisableAuth = status !== "active";

  const previousDisabled = targetUser.disabled;

  // Keep Firebase Authentication and Firestore synchronized.
  await auth.updateUser(userId, {
    disabled: shouldDisableAuth,
  });

  try {
    await userRef.update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Attempt to restore the previous Auth state if
    // the Firestore update fails.
    try {
      await auth.updateUser(userId, {
        disabled: previousDisabled,
      });
    } catch (rollbackError) {
      console.error(
        "Failed to roll back Firebase Auth status:",
        rollbackError,
      );
    }

    throw error;
  }
}
