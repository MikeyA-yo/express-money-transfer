import nodemailer from 'nodemailer';
import { render } from '@react-email/render';
import { nodemailerConfig } from '../../config/smtp.js';
import { globalConfig } from '../../config/env.js';
import { EmailNotification } from './email-notif.js';

// Create a transporter using your email service provider's SMTP settings
const transporter = nodemailer.createTransport(nodemailerConfig(true));
const defaultFrom = globalConfig(process).SMTP_USER;

/**
 * Send notification email rendered from React Email template.
 * @param {object} params
 * @param {string} params.to - Recipient email
 * @param {string} [params.subject] - Email subject
 * @param {string} [params.message] - Optional note or message
 * @param {number|string|bigint} [params.amount] - Amount in minor units
 * @param {string} [params.currency] - Currency code (e.g. 'USD', 'NGN')
 * @param {string} [params.reference] - Transfer reference / ID
 * @param {string} [params.fromAccountId] - Source account identifier
 * @param {string} [params.toAccountId] - Destination account identifier
 * @param {string} [params.completedAt] - ISO completion timestamp
 * @param {string} [params.status] - Transfer status
 * @param {string} [params.from] - Sender email (defaults to SMTP_USER)
 * @param {object} [params.customTransporter] - Transporter override for tests
 * @returns {Promise<object>} Nodemailer sendMail result
 */
export async function sendNotificationEmail({
  to,
  subject,
  message,
  amount,
  currency = 'USD',
  reference,
  fromAccountId,
  toAccountId,
  completedAt,
  status = 'COMPLETED',
  from = defaultFrom,
  customTransporter = transporter
}) {
  const emailSubject = subject || (reference ? `Transfer Notification: ${reference}` : 'Transfer Notification');

  // Render the email content using the React component
  const emailHtml = await render(
    EmailNotification({
      subject: emailSubject,
      message,
      amount,
      currency,
      reference,
      fromAccountId,
      toAccountId,
      completedAt,
      status
    })
  );

  // Send the email
  const details = await customTransporter.sendMail({
    from,
    to,
    subject: emailSubject,
    html: emailHtml
  });

  return details;
}

export { transporter };