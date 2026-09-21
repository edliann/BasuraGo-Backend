import {createHash} from "crypto";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "../firebaseAdmin";

const MAX_ATTEMPTS = 5;

function hashOtp(
  otp: string,
  salt: string,
): string {
  return createHash("sha256")
    .update(`${salt}:${otp}`)
    .digest("hex");
}

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

  const verificationRef = firestore
    .collection("phoneVerifications")
    .doc(verificationId);

  const verificationSnapshot =
    await verificationRef.get();

  if (!verificationSnapshot.exists) {
    throw new Error(
      "Verification request was not found.",
    );
  }

  const verification =
    verificationSnapshot.data();

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

  const attempts =
    Number(verification.attempts ?? 0);

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
    await verificationRef.update({
      attempts: attempts + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });

    throw new Error(
      "Incorrect verification code.",
    );
  }

  const phoneNumber =
    verification.phoneNumber;

  const phoneRef = firestore
    .collection("phoneNumbers")
    .doc(phoneNumber);

  const customerRef = firestore
    .collection("customers")
    .doc(userId);

  await firestore.runTransaction(
    async (transaction) => {
      const phoneSnapshot =
        await transaction.get(phoneRef);

      if (phoneSnapshot.exists) {
        const existingUserId =
          phoneSnapshot.data()?.userId;

        if (existingUserId !== userId) {
          throw new Error(
            "This phone number is already registered.",
          );
        }
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