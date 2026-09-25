import {getAuth} from "firebase-admin/auth";
import {FieldValue} from "firebase-admin/firestore";

import {firestore} from "../firebaseAdmin";

export type CustomerStatus =
  | "active"
  | "inactive"
  | "suspended";

const VALID_STATUSES: CustomerStatus[] = [
  "active",
  "inactive",
  "suspended",
];

/**
 * Updates a customer's account status.
 *
 * @param {string} customerId - The customer's Firebase Auth user ID.
 * @param {CustomerStatus} status - The new customer account status.
 */
export async function updateCustomerStatus(
  customerId: string,
  status: CustomerStatus,
): Promise<void> {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error("Invalid customer account status.");
  }

  const auth = getAuth();
  const targetUser = await auth.getUser(customerId);

  if (targetUser.customClaims?.admin === true) {
    throw new Error(
      "Administrative accounts cannot be modified as customers.",
    );
  }

  const customerRef = firestore
    .collection("customers")
    .doc(customerId);

  const userRef = firestore
    .collection("users")
    .doc(customerId);

  const customerSnapshot = await customerRef.get();

  if (!customerSnapshot.exists) {
    throw new Error("Customer account was not found.");
  }

  const customerData = customerSnapshot.data();

  if (
    customerData?.status === undefined &&
    customerData?.fullName === undefined
  ) {
    throw new Error("Invalid customer account.");
  }

  const userSnapshot = await userRef.get();

  if (
    userSnapshot.exists &&
    userSnapshot.data()?.role !== "customer"
  ) {
    throw new Error(
      "The selected account is not a customer.",
    );
  }

  const previousDisabled = targetUser.disabled;
  const shouldDisableAuth = status !== "active";

  await auth.updateUser(customerId, {
    disabled: shouldDisableAuth,
  });

  try {
    const now = FieldValue.serverTimestamp();

    await Promise.all([
      customerRef.update({
        status,
        updatedAt: now,
      }),
      userSnapshot.exists ?
        userRef.update({
          status,
          updatedAt: now,
        }) :
        Promise.resolve(),
    ]);
  } catch (error) {
    try {
      await auth.updateUser(customerId, {
        disabled: previousDisabled,
      });
    } catch (rollbackError) {
      console.error(
        "Failed to roll back customer Auth status:",
        rollbackError,
      );
    }

    throw error;
  }
}
