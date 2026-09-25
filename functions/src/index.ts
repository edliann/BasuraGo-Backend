import {onCall, HttpsError} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions";

import {requestPhoneVerification} from
  "./phone/requestVerification";

import {philSmsApiToken} from "./sms/provider";

import {confirmPhoneVerification} from
  "./phone/confirmVerification";

import {getAuth} from "firebase-admin/auth";

import {createStaffAccount} from "./staff/createStaffAccount";
import {listStaffAccounts} from "./staff/listStaffAccounts";

import {
  StaffStatus,
  updateStaffStatus,
} from "./staff/updateStaffStatus";

import {
  CustomerStatus,
  updateCustomerStatus,
} from "./customers/updateCustomerStatus";

import {
  createRiderInvitation as createRiderInvitationService,
} from "./riders/createRiderInvitation";

import {
  getRiderInvitation as getRiderInvitationService,
} from "./riders/getRiderInvitation";

import {
  createRiderAccountFromInvitation as
  createRiderAccountFromInvitationService,
} from "./riders/createRiderAccountFromInvitation";

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

export const updateCustomerStatusFunction = onCall(
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

    if (caller.customClaims?.admin !== true) {
      throw new HttpsError(
        "permission-denied",
        "Only Admin staff can change customer account status.",
      );
    }

    const data = request.data as {
      customerId?: unknown;
      status?: unknown;
    };

    if (
      typeof data.customerId !== "string" ||
      typeof data.status !== "string"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "customerId and status are required.",
      );
    }

    if (
      data.status !== "active" &&
      data.status !== "inactive" &&
      data.status !== "suspended"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid customer account status.",
      );
    }

    try {
      await updateCustomerStatus(
        data.customerId,
        data.status as CustomerStatus,
      );

      return {
        success: true,
      };
    } catch (error) {
      console.error(
        "Failed to update customer status:",
        error,
      );

      const message =
        error instanceof Error ?
          error.message :
          "Unable to update customer status.";

      throw new HttpsError(
        "failed-precondition",
        message,
      );
    }
  },
);

export const requestPhoneVerificationFunction =
  onCall(
    {
      secrets: [philSmsApiToken],
    },
    async (request) => {
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
    },
  );

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

/**
 * Creates a rider invitation for an authenticated Admin.
 */
export const createRiderInvitation = onCall(
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

    if (caller.customClaims?.admin !== true) {
      throw new HttpsError(
        "permission-denied",
        "Only Admin staff can create rider invitations.",
      );
    }

    const data = request.data as {
      email?: unknown;
      phoneNumber?: unknown;
    };

    if (
      typeof data.email !== "string" ||
      typeof data.phoneNumber !== "string"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "email and phoneNumber are required.",
      );
    }

    try {
      return await createRiderInvitationService(
        {
          email: data.email,
          phoneNumber: data.phoneNumber,
        },
        request.auth.uid,
      );
    } catch (error) {
      console.error(
        "Failed to create rider invitation:",
        error,
      );

      const message =
        error instanceof Error ?
          error.message :
          "Unable to create rider invitation.";

      throw new HttpsError(
        "failed-precondition",
        message,
      );
    }
  },
);

/**
 * Retrieves and validates a rider invitation.
 */
export const getRiderInvitation = onCall(
  async (request) => {
    const data = request.data as {
      invitationId?: unknown;
      invitationToken?: unknown;
    };

    if (
      typeof data.invitationId !== "string" ||
      typeof data.invitationToken !== "string"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "invitationId and invitationToken are required.",
      );
    }

    return await getRiderInvitationService({
      invitationId: data.invitationId,
      invitationToken: data.invitationToken,
    });
  },
);

/**
 * Creates a rider account from a valid invitation.
 */
export const createRiderAccountFromInvitation =
  onCall(async (request) => {
    const data = request.data as {
      invitationId?: unknown;
      invitationToken?: unknown;
      fullName?: unknown;
      password?: unknown;
    };

    if (
      typeof data.invitationId !== "string" ||
      typeof data.invitationToken !== "string" ||
      typeof data.fullName !== "string" ||
      typeof data.password !== "string"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "invitationId, invitationToken, fullName, and password are required.",
      );
    }

    return await createRiderAccountFromInvitationService({
      invitationId: data.invitationId,
      invitationToken: data.invitationToken,
      fullName: data.fullName,
      password: data.password,
    });
  });
