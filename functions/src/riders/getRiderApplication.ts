import {HttpsError} from "firebase-functions/v2/https";

import {firestore} from "../firebaseAdmin";

export interface GetRiderApplicationResult {
  riderId: string;
  application: Record<string, unknown>;
}

/**
 * Gets a rider application for Admin review.
 *
 * @param {string} riderId Rider Firebase UID.
 * @return {Promise<GetRiderApplicationResult>} Rider application.
 */
export async function getRiderApplication(
  riderId: string,
): Promise<GetRiderApplicationResult> {
  const normalizedRiderId = riderId.trim();

  if (!normalizedRiderId) {
    throw new HttpsError(
      "invalid-argument",
      "Rider ID is required.",
    );
  }

  const applicationSnapshot = await firestore
    .collection("riderApplications")
    .doc(normalizedRiderId)
    .get();

  if (!applicationSnapshot.exists) {
    throw new HttpsError(
      "not-found",
      "Rider application was not found.",
    );
  }

  return {
    riderId: normalizedRiderId,
    application:
      applicationSnapshot.data() ?? {},
  };
}
