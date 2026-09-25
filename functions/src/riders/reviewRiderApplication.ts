import {FieldValue} from "firebase-admin/firestore";

import {HttpsError} from "firebase-functions/v2/https";

import {firestore} from "../firebaseAdmin";

export type RiderApplicationReviewStatus =
  | "under_review"
  | "approved"
  | "needs_correction"
  | "rejected";

export interface ReviewRiderApplicationInput {
  riderId: string;
  status: RiderApplicationReviewStatus;
  rejectionReason?: string;
  correctionMessage?: string;
}

export interface ReviewRiderApplicationResult {
  riderId: string;
  status: RiderApplicationReviewStatus;
}

/**
 * Reviews a rider application.
 *
 * Approval activates the rider account.
 * Other review outcomes keep the rider account pending.
 *
 * @param {ReviewRiderApplicationInput} input Review information.
 * @return {Promise<ReviewRiderApplicationResult>} Review result.
 */
export async function reviewRiderApplication(
  input: ReviewRiderApplicationInput,
): Promise<ReviewRiderApplicationResult> {
  const riderId = input.riderId.trim();
  const status = input.status;

  if (!riderId) {
    throw new HttpsError(
      "invalid-argument",
      "Rider ID is required.",
    );
  }

  const allowedStatuses:
    RiderApplicationReviewStatus[] = [
      "under_review",
      "approved",
      "needs_correction",
      "rejected",
    ];

  if (!allowedStatuses.includes(status)) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid rider application review status.",
    );
  }

  const rejectionReason =
    input.rejectionReason?.trim() ?? "";

  const correctionMessage =
    input.correctionMessage?.trim() ?? "";

  if (
    status === "rejected" &&
    !rejectionReason
  ) {
    throw new HttpsError(
      "invalid-argument",
      "A rejection reason is required.",
    );
  }

  if (
    status === "needs_correction" &&
    !correctionMessage
  ) {
    throw new HttpsError(
      "invalid-argument",
      "A correction message is required.",
    );
  }

  const applicationRef = firestore
    .collection("riderApplications")
    .doc(riderId);

  const riderRef = firestore
    .collection("riders")
    .doc(riderId);

  const userRef = firestore
    .collection("users")
    .doc(riderId);

  const applicationSnapshot =
    await applicationRef.get();

  if (!applicationSnapshot.exists) {
    throw new HttpsError(
      "not-found",
      "Rider application was not found.",
    );
  }

  const application =
    applicationSnapshot.data();

  if (!application) {
    throw new HttpsError(
      "not-found",
      "Rider application data was not found.",
    );
  }

  if (application.riderId !== riderId) {
    throw new HttpsError(
      "failed-precondition",
      "Rider application ownership is invalid.",
    );
  }

  if (
    application.status !== "submitted" &&
    application.status !== "under_review"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Only submitted or under-review applications can be reviewed.",
    );
  }

  const riderSnapshot = await riderRef.get();

  if (!riderSnapshot.exists) {
    throw new HttpsError(
      "not-found",
      "Rider profile was not found.",
    );
  }

  const userSnapshot = await userRef.get();

  if (!userSnapshot.exists) {
    throw new HttpsError(
      "not-found",
      "Rider user profile was not found.",
    );
  }

  const now = FieldValue.serverTimestamp();

  const batch = firestore.batch();

  batch.update(applicationRef, {
    status,
    reviewedAt: now,
    rejectionReason:
      status === "rejected" ?
        rejectionReason :
        null,
    correctionMessage:
      status === "needs_correction" ?
        correctionMessage :
        null,
    updatedAt: now,
  });

  const accountStatus =
    status === "approved" ?
      "active" :
      "pending";

  batch.update(userRef, {
    status: accountStatus,
    updatedAt: now,
  });

  batch.update(riderRef, {
    status: accountStatus,
    updatedAt: now,
  });

  await batch.commit();

  return {
    riderId,
    status,
  };
}
