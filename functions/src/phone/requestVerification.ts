import {createHash, randomBytes, randomInt} from "crypto";
import {FieldValue} from "firebase-admin/firestore";

import {firestore} from "../firebaseAdmin";
import {smsProvider} from "../sms/provider";

const OTP_LENGTH = 6;
const OTP_EXPIRATION_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function normalizePhoneNumber(phoneNumber: string): string {
  return phoneNumber.trim().replace(/[^\d+]/g, "");
}

function isValidE164(phoneNumber: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phoneNumber);
}

function hashOtp(otp: string, salt: string): string {
  return createHash("sha256")
    .update(`${salt}:${otp}`)
    .digest("hex");
}

function getVerificationDocumentId(
  userId: string,
  phoneNumber: string,
): string {
  return createHash("sha256")
    .update(`${userId}:${phoneNumber}`)
    .digest("hex");
}

export async function requestPhoneVerification(
  userId: string,
  phoneNumberInput: string,
): Promise<{
  verificationId: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
}> {
  const phoneNumber = normalizePhoneNumber(phoneNumberInput);

  if (!isValidE164(phoneNumber)) {
    throw new Error("Phone number must be in E.164 format.");
  }

  // Make sure the caller is actually a customer.
  const customerRef = firestore.collection("customers").doc(userId);
  const customerSnapshot = await customerRef.get();

  if (!customerSnapshot.exists) {
    throw new Error("Customer profile was not found.");
  }

  const customer = customerSnapshot.data();

  if (customer?.status !== "active") {
    throw new Error("Customer account is not active.");
  }

  // Check whether another account already owns this verified number.
  const phoneRef = firestore.collection("phoneNumbers").doc(phoneNumber);
  const phoneSnapshot = await phoneRef.get();

  if (phoneSnapshot.exists) {
    const existingUserId = phoneSnapshot.data()?.userId;
    const verified = phoneSnapshot.data()?.verified === true;

    if (verified && existingUserId !== userId) {
      throw new Error("This phone number is already registered.");
    }
  }

  /*
   * One deterministic verification document per
   * customer + phone number.
   *
   * A new resend replaces the previous OTP instead
   * of creating another pending verification record.
   */
  const verificationId = getVerificationDocumentId(
    userId,
    phoneNumber,
  );

  const verificationRef = firestore
    .collection("phoneVerifications")
    .doc(verificationId);

  const existingVerificationSnapshot = await verificationRef.get();

  if (existingVerificationSnapshot.exists) {
    const existing = existingVerificationSnapshot.data();

    const resendAvailableAt =
      existing?.resendAvailableAt?.toMillis?.() ?? 0;

    if (Date.now() < resendAvailableAt) {
      const remainingSeconds = Math.ceil(
        (resendAvailableAt - Date.now()) / 1000,
      );

      throw new Error(
        `Please wait ${remainingSeconds} seconds before requesting another code.`,
      );
    }
  }

  const otp = randomInt(
    10 ** (OTP_LENGTH - 1),
    10 ** OTP_LENGTH,
  ).toString();

  const salt = randomBytes(32).toString("hex");
  const otpHash = hashOtp(otp, salt);

  const now = Date.now();
  const expiresAt = new Date(now + OTP_EXPIRATION_MS);
  const resendAvailableAt = new Date(
    now + RESEND_COOLDOWN_MS,
  );

  await verificationRef.set({
    userId,
    phoneNumber,
    otpHash,
    salt,
    status: "pending",
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    resendAvailableAt,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await smsProvider.send({
    to: phoneNumber,
    message:
      `Your BasuraGo verification code is ${otp}. ` +
      "It expires in 5 minutes.",
  });

  return {
    verificationId,
    expiresInSeconds: OTP_EXPIRATION_MS / 1000,
    resendAvailableInSeconds: RESEND_COOLDOWN_MS / 1000,
  };
}