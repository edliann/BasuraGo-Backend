import {randomBytes, createHash} from "node:crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";

import {firestore} from "../firebaseAdmin";

const INVITATION_TTL_MS =
  7 * 24 * 60 * 60 * 1000;

export interface CreateRiderInvitationInput {
  email: string;
  phoneNumber: string;
}

export interface CreateRiderInvitationResult {
  invitationId: string;
  invitationToken: string;
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
 * Creates a new rider invitation.
 *
 * @param {CreateRiderInvitationInput} input Invitation information.
 * @param {string} invitedBy UID of the inviting administrator.
 * @return {Promise<CreateRiderInvitationResult>} Created invitation.
 */
export async function createRiderInvitation(
  input: CreateRiderInvitationInput,
  invitedBy: string,
): Promise<CreateRiderInvitationResult> {
  const email = input.email
    .trim()
    .toLowerCase();

  const phoneNumber =
    input.phoneNumber.trim();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error(
      "A valid email address is required.",
    );
  }

  if (!phoneNumber) {
    throw new Error(
      "Phone number is required.",
    );
  }

  if (!invitedBy.trim()) {
    throw new Error(
      "The inviting administrator is required.",
    );
  }

  const invitationToken =
    randomBytes(32).toString("hex");

  const tokenHash =
    hashInvitationToken(invitationToken);

  const invitationRef = firestore
    .collection("riderInvitations")
    .doc();

  const expiresAt = Timestamp.fromMillis(
    Date.now() + INVITATION_TTL_MS,
  );

  await invitationRef.set({
    email,
    phoneNumber,
    tokenHash,
    status: "pending",
    invitedBy: invitedBy.trim(),
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    acceptedAt: null,
    acceptedBy: null,
  });

  return {
    invitationId: invitationRef.id,
    invitationToken,
    expiresAt:
      expiresAt.toDate().toISOString(),
  };
}
