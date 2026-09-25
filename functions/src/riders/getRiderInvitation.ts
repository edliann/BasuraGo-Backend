import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import {HttpsError} from
  "firebase-functions/v2/https";

import {firestore} from "../firebaseAdmin";

export interface GetRiderInvitationInput {
  invitationId: string;
  invitationToken: string;
}

export interface GetRiderInvitationResult {
  invitationId: string;
  email: string;
  phoneNumber: string;
  expiresAt: string;
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
 * Retrieves and validates a rider invitation.
 *
 * @param {GetRiderInvitationInput} input Invitation credentials.
 * @return {Promise<GetRiderInvitationResult>} Valid invitation data.
 */
export async function getRiderInvitation(
  input: GetRiderInvitationInput,
): Promise<GetRiderInvitationResult> {
  const invitationId =
    input.invitationId.trim();

  const invitationToken =
    input.invitationToken.trim();

  if (
    !invitationId ||
    !invitationToken
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invitation ID and invitation token are required.",
    );
  }

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

  if (!data) {
    throw new HttpsError(
      "permission-denied",
      "This invitation is invalid.",
    );
  }

  if (data.status !== "pending") {
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
    invitationId,
    email: data.email,
    phoneNumber: data.phoneNumber,
    expiresAt:
      expiresAt.toDate().toISOString(),
  };
}
