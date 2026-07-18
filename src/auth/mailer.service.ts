import { Injectable, Logger } from '@nestjs/common';

/**
 * Outbound-mail seam. No provider is wired up yet, so delivery is a log
 * line — swap the body for a real sender (SES, Resend, …) when one exists.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  sendPasswordResetCode(email: string, code: string) {
    this.logger.log(`Password reset code for ${email}: ${code}`);
  }
}
