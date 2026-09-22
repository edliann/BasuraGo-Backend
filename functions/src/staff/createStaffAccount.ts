import {getAuth} from "firebase-admin/auth";
import {FieldValue} from "firebase-admin/firestore";

import {firestore} from "../firebaseAdmin";

/**
 * Creates a new BasuraGo staff account.
 *
 * @param {object} input Staff account information.
 * @param {string} input.fullName Staff member's full name.
 * @param {string} input.email Staff member's email address.
 * @param {string} input.password Initial password.
 * @return {Promise<{userId: string}>} The created user's ID.
 */
export async function createStaffAccount(
  input: {
    fullName: string;
    email: string;
    password: string;
  },
): Promise<{userId: string}> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();

  if (!fullName) {
    throw new Error("Full name is required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email address is required.");
  }

  if (input.password.length < 8) {
    throw new Error(
      "Password must contain at least 8 characters.",
    );
  }

  if (!/[a-z]/.test(input.password)) {
    throw new Error(
      "Password must contain at least one lowercase character.",
    );
  }

  if (!/[A-Z]/.test(input.password)) {
    throw new Error(
      "Password must contain at least one uppercase character.",
    );
  }

  if (!/[^A-Za-z0-9]/.test(input.password)) {
    throw new Error(
      "Password must contain at least one non-alphanumeric character.",
    );
  }

  const userRecord = await getAuth().createUser({
    email,
    password: input.password,
    displayName: fullName,
    emailVerified: false,
  });

  await getAuth().setCustomUserClaims(userRecord.uid, {
    admin: true,
    superAdmin: false,
  });

  const now = FieldValue.serverTimestamp();

  await firestore.collection("users").doc(userRecord.uid).set({
    fullName,
    email,
    role: "admin",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  return {
    userId: userRecord.uid,
  };
}
