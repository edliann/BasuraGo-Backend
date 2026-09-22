import {createHash} from "crypto";
import {FieldValue} from "firebase-admin/firestore";

import {firestore} from "../firebaseAdmin";

const MAX_ATTEMPTS = 5;

/**
 * Hashes an OTP using the supplied salt.
 *
 * @param {string} otp The one-time password.
 * @param {string} salt The salt used when hashing the OTP.
 * @return {string} The SHA-256 hash of the salted OTP.
 */
function hashOtp(
  otp: string,
  salt: string,
): string {
  return createHash("sha256")
    .update(`${salt}:${otp}`)
    .digest("hex");
}

/**
 * Confirms a customer's phone verification request.
 *
 * @param {string} userId The authenticated customer's user ID.
 * @param {string} verificationId The verification request ID.
 * @param {string} otp The six-digit verification code.
 * @return {Promise<void>} A promise that resolves when verification succeeds.
 */
export async function confirmPhoneVerification(
  userId: string,
  verificationId: string,
  otp: string,
): Promise<void> {
  if (!/^\d{6}$/.test(otp)) {
    throw new Error(
      "Verification code must contain 6 digits.",
    );
  }

  // Make sure the caller is an active customer.
  const customerRef = firestore
    .collection("customers")
    .doc(userId);

  const customerSnapshot = await customerRef.get();

  if (!customerSnapshot.exists) {
    throw new Error("Customer profile was not found.");
  }

  const customer = customerSnapshot.data();

  if (customer?.status !== "active") {
    throw new Error("Customer account is not active.");
  }

  const verificationRef = firestore
    .collection("phoneVerifications")
    .doc(verificationId);

  const verificationSnapshot = await verificationRef.get();

  if (!verificationSnapshot.exists) {
    throw new Error(
      "Verification request was not found.",
    );
  }

  const verification = verificationSnapshot.data();

  if (!verification) {
    throw new Error(
      "Verification request is invalid.",
    );
  }

  if (verification.userId !== userId) {
    throw new Error(
      "You are not authorized to use this verification request.",
    );
  }

  if (verification.status !== "pending") {
    throw new Error(
      "This verification request is no longer active.",
    );
  }

  const expiresAt =
    verification.expiresAt?.toMillis?.() ?? 0;

  if (Date.now() > expiresAt) {
    await verificationRef.update({
      status: "expired",
      updatedAt: FieldValue.serverTimestamp(),
    });

    throw new Error(
      "This verification code has expired.",
    );
  }

  const attempts = Number(
    verification.attempts ?? 0,
  );

  if (attempts >= MAX_ATTEMPTS) {
    await verificationRef.update({
      status: "locked",
      updatedAt: FieldValue.serverTimestamp(),
    });

    throw new Error(
      "Too many incorrect attempts.",
    );
  }

  const expectedHash = hashOtp(
    otp,
    verification.salt,
  );

  if (expectedHash !== verification.otpHash) {
    const nextAttempts = attempts + 1;

    await verificationRef.update({
      attempts: nextAttempts,
      updatedAt: FieldValue.serverTimestamp(),
      ...(nextAttempts >= MAX_ATTEMPTS ?
        {status: "locked"} :
        {}),
    });

    throw new Error(
      nextAttempts >= MAX_ATTEMPTS ?
        "Too many incorrect attempts." :
        "Incorrect verification code.",
    );
  }

  const phoneNumber = verification.phoneNumber;

  if (typeof phoneNumber !== "string") {
    throw new Error(
      "Verification request has an invalid phone number.",
    );
  }

  const phoneRef = firestore
    .collection("phoneNumbers")
    .doc(phoneNumber);

  const usersRef = firestore
    .collection("users")
    .doc(userId);

  await firestore.runTransaction(
    async (transaction) => {
      const phoneSnapshot =
        await transaction.get(phoneRef);

      if (phoneSnapshot.exists) {
        const existingUserId =
          phoneSnapshot.data()?.userId;

        const verified =
          phoneSnapshot.data()?.verified === true;

        if (
          verified &&
          existingUserId !== userId
        ) {
          throw new Error(
            "This phone number is already registered.",
          );
        }

        transaction.update(phoneRef, {
          userId,
          role: "customer",
          phoneNumber,
          verified: true,
          updatedAt:
            FieldValue.serverTimestamp(),
        });
      } else {
        transaction.set(phoneRef, {
          userId,
          role: "customer",
          phoneNumber,
          verified: true,
          createdAt:
            FieldValue.serverTimestamp(),
          updatedAt:
            FieldValue.serverTimestamp(),
        });
      }

      transaction.update(customerRef, {
        phoneNumber,
        phoneVerified: true,
        updatedAt:
          FieldValue.serverTimestamp(),
      });

      transaction.update(usersRef, {
        phoneNumber,
        phoneVerified: true,
        updatedAt:
          FieldValue.serverTimestamp(),
      });

      transaction.update(verificationRef, {
        status: "verified",
        verifiedAt:
          FieldValue.serverTimestamp(),
        updatedAt:
          FieldValue.serverTimestamp(),
      });
    },
  );
}
