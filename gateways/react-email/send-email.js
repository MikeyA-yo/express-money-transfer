import nodemailer from 'nodemailer';
import { render } from 'react-email';
import { nodemailerConfig } from '../../config/smtp.js';
import { globalConfig } from '../../config/env.js';
import { EmailNotification } from './email-notif.jsx';

// Create a transporter using your email service provider's SMTP settings
const transporter = nodemailer.createTransport({
 ...nodemailerConfig(true)
});
const from = globalConfig(process).SMTP_USER;
export async function sendNotificationEmail({ to, subject, message, from=from }) {
  // Render the email content using the React component
  const emailHtml = render(<EmailNotification subject={subject} message={message} />);

  // Send the email
  await transporter.sendMail({
    from,
    to,
    subject,
    html: emailHtml
  });
}