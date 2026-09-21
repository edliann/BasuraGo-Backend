export interface SmsMessage {
  to: string;
  message: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<void>;
}

/**
 * Development-only SMS provider.
 *
 * This does NOT send a real SMS.
 * The OTP is printed by the backend so we can test the
 * complete verification flow before connecting PhilSMS.
 */
export class DevelopmentSmsProvider implements SmsProvider {
  async send({to, message}: SmsMessage): Promise<void> {
    console.log("========================================");
    console.log("DEVELOPMENT SMS");
    console.log(`To: ${to}`);
    console.log(`Message: ${message}`);
    console.log("========================================");
  }
}

export const smsProvider: SmsProvider =
  new DevelopmentSmsProvider();