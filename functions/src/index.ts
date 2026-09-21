import {onCall, HttpsError} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions";

import {firestore} from "./firebaseAdmin";

import {requestPhoneVerification} from
  "./phone/requestVerification";

import {confirmPhoneVerification} from
  "./phone/confirmVerification";

void firestore;

setGlobalOptions({
  maxInstances: 10,
});

export const requestPhoneVerificationFunction =
  onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in.",
      );
    }

    const data = request.data as {
      phoneNumber?: unknown;
    };

    if (
      typeof data.phoneNumber !== "string"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "phoneNumber is required.",
      );
    }

    try {
      return await requestPhoneVerification(
        request.auth.uid,
        data.phoneNumber,
      );
    } catch (error) {
      console.error(
        "Failed to request phone verification:",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to request verification.";

      throw new HttpsError(
        "failed-precondition",
        message,
      );
    }
  });

export const confirmPhoneVerificationFunction =
  onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in.",
      );
    }

    const data = request.data as {
      verificationId?: unknown;
      otp?: unknown;
    };

    if (
      typeof data.verificationId !== "string" ||
      typeof data.otp !== "string"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "verificationId and otp are required.",
      );
    }

    try {
      await confirmPhoneVerification(
        request.auth.uid,
        data.verificationId,
        data.otp,
      );

      return {
        success: true,
      };
    } catch (error) {
      console.error(
        "Failed to confirm phone verification:",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to verify phone number.";

      throw new HttpsError(
        "failed-precondition",
        message,
      );
    }
  });