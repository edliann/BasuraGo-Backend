import {randomBytes, randomInt, createHash} from "crypto";
import {smsProvider} from "../sms/provider";
import {FieldValue} from "firebase-admin/firestore";
import {firestore} from "../firebaseAdmin";

const OTP_LENGTH = 6;
const OTP_EXPIRATION_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

function normalizePhoneNumber(phoneNumber: string): string {
  return phoneNumber.trim().replace(/[^\d+]/g, "");
}

function isValidE164(phoneNumber: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phoneNumber);
}

function hashOtp(
  otp: string,
  salt: string,
): string {
  return createHash("sha256")
    .update(`${salt}:${otp}`)
    .digest("hex");
}

export async function requestPhoneVerification(
  userId: string,
  phoneNumberInput: string,
): Promise<{
  verificationId: string;
  expiresInSeconds: number;
}> {
  const phoneNumber =
    normalizePhoneNumber(phoneNumberInput);

  if (!isValidE164(phoneNumber)) {
    throw new Error(
      "Phone number must be in E.164 format.",
    );
  }

  const phoneRef = firestore
    .collection("phoneNumbers")
    .doc(phoneNumber);

  const phoneSnapshot = await phoneRef.get();

  if (phoneSnapshot.exists) {
    const existingUserId =
      phoneSnapshot.data()?.userId;

    if (existingUserId !== userId) {
      throw new Error(
        "This phone number is already registered.",
      );
    }
  }

  const recentVerificationSnapshot =
    await firestore
      .collection("phoneVerifications")
      .where("userId", "==", userId)
      .where("phoneNumber", "==", phoneNumber)
      .where("status", "==", "pending")
      .limit(1)
      .get();

  if (!recentVerificationSnapshot.empty) {
    const existing =
      recentVerificationSnapshot.docs[0].data();

    const resendAvailableAt =
      existing.resendAvailableAt?.toMillis?.() ?? 0;

    if (Date.now() < resendAvailableAt) {
      throw new Error(
        "Please wait before requesting another code.",
      );
    }
  }

  const otp = randomInt(
    10 ** (OTP_LENGTH - 1),
    10 ** OTP_LENGTH,
  ).toString();

  const salt =
    randomBytes(32).toString("hex");

  const otpHash = hashOtp(otp, salt);

  const verificationRef =
    firestore.collection(
      "phoneVerifications",
    ).doc();

  const now = Date.now();

  await verificationRef.set({
    userId,
    phoneNumber,
    otpHash,
    salt,
    status: "pending",
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(
      now + OTP_EXPIRATION_MS,
    ),
    resendAvailableAt: new Date(
      now + RESEND_COOLDOWN_MS,
    ),
  });

  await smsProvider.send({
    to: phoneNumber,
    message:
      `Your BasuraGo verification code is ${otp}. ` +
      "It expires in 5 minutes.",
  });

  return {
    verificationId: verificationRef.id,
    expiresInSeconds:
      OTP_EXPIRATION_MS / 1000,
  };
}