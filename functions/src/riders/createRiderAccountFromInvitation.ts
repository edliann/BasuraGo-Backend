import {getAuth} from "firebase-admin/auth";
import {FieldValue} from "firebase-admin/firestore";

import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import {HttpsError} from
  "firebase-functions/v2/https";

import {firestore} from "../firebaseAdmin";

export interface CreateRiderAccountInput {
  invitationId: string;
  invitationToken: string;
  fullName: string;
  password: string;
}

export interface CreateRiderAccountResult {
  riderId: string;
  email: string;
  phoneNumber: string;
}

/**
 * Creates a SHA-256 hash of an invitation token.
 *
 * @param {string} token Invitation token.
 * @return {string} Hashed invitation token.
 */
function hashInvitationToken(
  token: string,
): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

/**
 * Compares an invitation token against its stored hash.
 *
 * @param {string} providedToken Token supplied by the rider.
 * @param {string} storedHash Stored invitation token hash.
 * @return {boolean} Whether the tokens match.
 */
function tokensMatch(
  providedToken: string,
  storedHash: string,
): boolean {
  const providedHash = Buffer.from(
    hashInvitationToken(providedToken),
    "utf8",
  );

  const expectedHash = Buffer.from(
    storedHash,
    "utf8",
  );

  return (
    providedHash.length ===
      expectedHash.length &&
    timingSafeEqual(
      providedHash,
      expectedHash,
    )
  );
}

/**
 * Validates rider account password requirements.
 *
 * @param {string} password Password to validate.
 * @return {void}
 */
function validatePassword(
  password: string,
): void {
  if (password.length < 8) {
    throw new HttpsError(
      "invalid-argument",
      "Password must contain at least 8 characters.",
    );
  }

  if (!/[a-z]/.test(password)) {
    throw new HttpsError(
      "invalid-argument",
      "Password must contain at least one lowercase character.",
    );
  }

  if (!/[A-Z]/.test(password)) {
    throw new HttpsError(
      "invalid-argument",
      "Password must contain at least one uppercase character.",
    );
  }

  if (!/[0-9]/.test(password)) {
    throw new HttpsError(
      "invalid-argument",
      "Password must contain at least one number.",
    );
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new HttpsError(
      "invalid-argument",
      "Password must contain at least one special character.",
    );
  }

  if (/\s/.test(password)) {
    throw new HttpsError(
      "invalid-argument",
      "Password must not contain spaces.",
    );
  }
}

/**
 * Loads and validates a pending rider invitation.
 *
 * @param {string} invitationId Invitation document ID.
 * @param {string} invitationToken Invitation token.
 * @return {Promise<object>} Validated invitation data.
 */
async function getPendingInvitation(
  invitationId: string,
  invitationToken: string,
) {
  const snapshot = await firestore
    .collection("riderInvitations")
    .doc(invitationId)
    .get();

  if (!snapshot.exists) {
    throw new HttpsError(
      "permission-denied",
      "This invitation is invalid.",
    );
  }

  const data = snapshot.data();

  if (!data || data.status !== "pending") {
    throw new HttpsError(
      "failed-precondition",
      "This invitation is no longer available.",
    );
  }

  const expiresAt = data.expiresAt;

  if (
    !expiresAt ||
    typeof expiresAt.toMillis !==
      "function" ||
    expiresAt.toMillis() <= Date.now()
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This invitation has expired.",
    );
  }

  if (
    typeof data.tokenHash !== "string" ||
    !tokensMatch(
      invitationToken,
      data.tokenHash,
    )
  ) {
    throw new HttpsError(
      "permission-denied",
      "This invitation is invalid.",
    );
  }

  if (
    typeof data.email !== "string" ||
    typeof data.phoneNumber !== "string"
  ) {
    throw new HttpsError(
      "internal",
      "This invitation is missing required information.",
    );
  }

  return {
    email: data.email,
    phoneNumber: data.phoneNumber,
    expiresAt,
  };
}

/**
 * Creates a rider Firebase Authentication account
 * and its associated Firestore records.
 *
 * @param {CreateRiderAccountInput} input Rider account information.
 * @return {Promise<CreateRiderAccountResult>} Created rider account.
 */
export async function createRiderAccountFromInvitation(
  input: CreateRiderAccountInput,
): Promise<CreateRiderAccountResult> {
  const invitationId =
    input.invitationId.trim();

  const invitationToken =
    input.invitationToken.trim();

  const fullName =
    input.fullName.trim();

  if (
    !invitationId ||
    !invitationToken
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invitation ID and invitation token are required.",
    );
  }

  if (!fullName) {
    throw new HttpsError(
      "invalid-argument",
      "Full name is required.",
    );
  }

  validatePassword(input.password);

  const invitation =
    await getPendingInvitation(
      invitationId,
      invitationToken,
    );

  let userRecord;

  try {
    userRecord =
      await getAuth().createUser({
        email: invitation.email,
        password: input.password,
        displayName: fullName,
        emailVerified: false,
        disabled: false,
      });
  } catch (error) {
    const authError =
      error as {code?: string};

    if (
      authError.code ===
      "auth/email-already-exists"
    ) {
      throw new HttpsError(
        "already-exists",
        "An account already exists for this invitation email.",
      );
    }

    console.error(
      "Failed to create rider authentication account:",
      error,
    );

    throw new HttpsError(
      "internal",
      "Unable to create the rider account.",
    );
  }

  try {
    const now =
      FieldValue.serverTimestamp();

    const batch = firestore.batch();

    batch.set(
      firestore
        .collection("users")
        .doc(userRecord.uid),
      {
        fullName,
        email: invitation.email,
        role: "rider",
        status: "pending",
        createdAt: now,
        updatedAt: now,
      },
    );

    batch.set(
      firestore
        .collection("riders")
        .doc(userRecord.uid),
      {
        fullName,
        email: invitation.email,
        phoneNumber:
          invitation.phoneNumber,
        status: "pending",
        vehicleId: null,
        createdAt: now,
        updatedAt: now,
      },
    );

    batch.set(
      firestore
        .collection("riderApplications")
        .doc(userRecord.uid),
      {
        riderId: userRecord.uid,
        status: "incomplete",
        basicInformationCompleted: true,
        identityDocumentCompleted: false,
        driversLicenseCompleted: false,
        faceVerificationCompleted: false,
        vehicleInformationCompleted: false,
        submittedAt: null,
        reviewedAt: null,
        rejectionReason: null,
        correctionMessage: null,
        createdAt: now,
        updatedAt: now,
      },
    );

    batch.update(
      firestore
        .collection("riderInvitations")
        .doc(invitationId),
      {
        status: "accepted",
        acceptedAt: now,
        acceptedBy: userRecord.uid,
        updatedAt: now,
      },
    );

    await batch.commit();

    return {
      riderId: userRecord.uid,
      email: invitation.email,
      phoneNumber:
        invitation.phoneNumber,
    };
  } catch (error) {
    console.error(
      "Failed to create rider Firestore records:",
      error,
    );

    try {
      await getAuth().deleteUser(
        userRecord.uid,
      );
    } catch (cleanupError) {
      console.error(
        "Failed to clean up rider authentication account:",
        cleanupError,
      );
    }

    throw new HttpsError(
      "internal",
      "Unable to finish creating the rider account.",
    );
  }
}
