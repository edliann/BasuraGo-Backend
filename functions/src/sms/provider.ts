import {defineSecret} from "firebase-functions/params";

export interface SmsMessage {
  to: string;
  message: string;
}

/**
 * Sends an SMS message.
 */
export interface SmsProvider {
  send(message: SmsMessage): Promise<void>;
}

/**
 * PhilSMS API token stored in Google Secret Manager.
 */
export const philSmsApiToken = defineSecret(
  "PHILSMS_API_TOKEN",
);

const PHILSMS_SMS_ENDPOINT =
  "https://dashboard.philsms.com/api/v3/sms/send";

/**
 * Sends SMS messages through PhilSMS.
 */
export class PhilSmsProvider implements SmsProvider {
  /**
   * Sends an SMS through the PhilSMS REST API.
   *
   * @param {SmsMessage} message - The SMS recipient and message.
   * @return {Promise<void>} Resolves when PhilSMS accepts the message.
   */
  async send({
    to,
    message,
  }: SmsMessage): Promise<void> {
    const apiToken = philSmsApiToken.value();

    if (!apiToken?.trim()) {
      throw new Error(
        "PhilSMS API token is not configured.",
      );
    }

    const response = await fetch(
      PHILSMS_SMS_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiToken,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          recipient: to.replace(/^\+/, ""),
          sender_id: "PhilSMS",
          type: "plain",
          message,
        }),
      },
    );

    const responseBody = await response.text();

    let parsedBody: unknown = null;

    try {
      parsedBody = JSON.parse(responseBody);
    } catch {
      // Keep the raw response for error logging.
    }

    if (!response.ok) {
      console.error(
        "PHILSMS_ERROR_STATUS:",
        response.status,
      );
      console.error(
        "PHILSMS_ERROR_BODY:",
        responseBody,
      );

      throw new Error(
        "Unable to send SMS through PhilSMS. [" +
        response.status +
        "]",
      );
    }

    if (
      typeof parsedBody !== "object" ||
      parsedBody === null ||
      !("status" in parsedBody) ||
      parsedBody.status !== "success"
    ) {
      console.error(
        "PhilSMS rejected the SMS:",
        responseBody,
      );

      const providerMessage =
        typeof parsedBody === "object" &&
        parsedBody !== null &&
        "message" in parsedBody &&
        typeof parsedBody.message === "string" ?
          parsedBody.message :
          "Unknown PhilSMS error.";

      throw new Error(
        "PhilSMS rejected the SMS: " +
        providerMessage,
      );
    }

    console.log(
      "PhilSMS SMS accepted:",
      responseBody,
    );
  }
}

export const smsProvider: SmsProvider =
  new PhilSmsProvider();
