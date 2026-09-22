import {onCall, HttpsError} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions";
import {firestore} from "./firebaseAdmin";

import {requestPhoneVerification} from
  "./phone/requestVerification";

import {confirmPhoneVerification} from
  "./phone/confirmVerification";

import {getAuth} from "firebase-admin/auth";

import {createStaffAccount} from "./staff/createStaffAccount";
import {listStaffAccounts} from "./staff/listStaffAccounts";

import {
  StaffStatus,
  updateStaffStatus,
} from "./staff/updateStaffStatus";

void firestore;

setGlobalOptions({
  maxInstances: 10,
});

export const createStaffAccountFunction = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in.",
      );
    }

    const caller = await getAuth().getUser(
      request.auth.uid,
    );

    if (
      caller.customClaims?.admin !== true ||
      caller.customClaims?.superAdmin !== true
    ) {
      throw new HttpsError(
        "permission-denied",
        "Only the Super Admin can create staff accounts.",
      );
    }

    const data = request.data as {
      fullName?: unknown;
      email?: unknown;
      password?: unknown;
    };

    if (
      typeof data.fullName !== "string" ||
      typeof data.email !== "string" ||
      typeof data.password !== "string"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "fullName, email, and password are required.",
      );
    }

    try {
      return await createStaffAccount({
        fullName: data.fullName,
        email: data.email,
        password: data.password,
      });
    } catch (error) {
      console.error(
        "Failed to create staff account:",
        error,
      );

      const message = error instanceof Error ?
        error.message :
        "Unable to create staff account.";

      throw new HttpsError(
        "failed-precondition",
        message,
      );
    }
  },
);

export const listStaffAccountsFunction = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in.",
      );
    }

    const caller = await getAuth().getUser(
      request.auth.uid,
    );

    if (
      caller.customClaims?.admin !== true ||
      caller.customClaims?.superAdmin !== true
    ) {
      throw new HttpsError(
        "permission-denied",
        "Only the Super Admin can view staff accounts.",
      );
    }

    try {
      return {
        staff: await listStaffAccounts(),
      };
    } catch (error) {
      console.error(
        "Failed to list staff accounts:",
        error,
      );

      throw new HttpsError(
        "internal",
        "Unable to load staff accounts.",
      );
    }
  },
);

export const updateStaffStatusFunction = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in.",
      );
    }

    const caller = await getAuth().getUser(
      request.auth.uid,
    );

    if (
      caller.customClaims?.admin !== true ||
      caller.customClaims?.superAdmin !== true
    ) {
      throw new HttpsError(
        "permission-denied",
        "Only the Super Admin can change staff account status.",
      );
    }

    const data = request.data as {
      userId?: unknown;
      status?: unknown;
    };

    if (
      typeof data.userId !== "string" ||
      typeof data.status !== "string"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "userId and status are required.",
      );
    }

    if (
      data.status !== "active" &&
      data.status !== "suspended" &&
      data.status !== "disabled"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid staff account status.",
      );
    }

    try {
      await updateStaffStatus(
        data.userId,
        data.status as StaffStatus,
      );

      return {
        success: true,
      };
    } catch (error) {
      console.error(
        "Failed to update staff account status:",
        error,
      );

      const message =
        error instanceof Error ?
          error.message :
          "Unable to update staff account status.";

      throw new HttpsError(
        "failed-precondition",
        message,
      );
    }
  },
);

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
        error instanceof Error ?
          error.message :
          "Unable to request verification.";

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
        error instanceof Error ?
          error.message :
          "Unable to verify phone number.";

      throw new HttpsError(
        "failed-precondition",
        message,
      );
    }
  });
