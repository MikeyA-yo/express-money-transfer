import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EmailNotification, formatAmount } from '../../gateways/react-email/email-notif.js';
import { sendNotificationEmail } from '../../gateways/react-email/send-email.js';

describe('React Email Gateway', () => {
  it('formatAmount - should format minor units to major currency string via Money Value Object', () => {
    assert.strictEqual(formatAmount(200, 'USD'), '2.00 USD');
    assert.strictEqual(formatAmount('200', 'USD'), '2.00 USD');
    assert.strictEqual(formatAmount(50000, 'NGN'), '500.00 NGN');
    assert.strictEqual(formatAmount('10.50 USD'), '10.50 USD');
    assert.strictEqual(formatAmount(null), '');
  });

  it('EmailNotification - should create a React element with subject and message', () => {
    const element = EmailNotification({
      subject: 'Transfer Alert',
      message: 'You sent $100.00'
    });

    assert.ok(element);
    assert.strictEqual(typeof element, 'object');
    assert.ok(element.type);
  });

  it('sendNotificationEmail - should format minor amount and render full transaction summary receipt', async () => {
    let capturedMailOptions = null;
    const mockTransporter = {
      sendMail: mock.fn(async (options) => {
        capturedMailOptions = options;
        return { messageId: 'msg-test-receipt-1' };
      })
    };

    const result = await sendNotificationEmail({
      to: 'customer@example.com',
      amount: 200,
      currency: 'USD',
      reference: 'TX-987654321',
      fromAccountId: 'acc-alice-101',
      toAccountId: 'acc-bob-202',
      completedAt: '2026-10-02T13:30:00.000Z',
      status: 'COMPLETED',
      customTransporter: mockTransporter
    });

    assert.strictEqual(mockTransporter.sendMail.mock.callCount(), 1);
    assert.strictEqual(capturedMailOptions.to, 'customer@example.com');
    assert.strictEqual(capturedMailOptions.subject, 'Transfer Notification: TX-987654321');

    // Verify Money Value Object formatted output is in the HTML
    assert.ok(capturedMailOptions.html.includes('2.00 USD'));
    assert.ok(capturedMailOptions.html.includes('TX-987654321'));
    assert.ok(capturedMailOptions.html.includes('acc-alice-101'));
    assert.ok(capturedMailOptions.html.includes('acc-bob-202'));
    assert.ok(capturedMailOptions.html.includes('Transfer Successful'));
    assert.ok(capturedMailOptions.html.includes('Express Money Transfer'));
    assert.deepStrictEqual(result, { messageId: 'msg-test-receipt-1' });
  });

  it('sendNotificationEmail - should render HTML and send email via transporter', async () => {
    let capturedMailOptions = null;
    const mockTransporter = {
      sendMail: mock.fn(async (options) => {
        capturedMailOptions = options;
        return { messageId: 'msg-test-123' };
      })
    };

    const result = await sendNotificationEmail({
      to: 'recipient@example.com',
      subject: 'Transfer Completed',
      message: 'Your transfer of $250.00 has completed successfully.',
      from: 'custom-sender@example.com',
      customTransporter: mockTransporter
    });

    assert.strictEqual(mockTransporter.sendMail.mock.callCount(), 1);
    assert.strictEqual(capturedMailOptions.to, 'recipient@example.com');
    assert.strictEqual(capturedMailOptions.from, 'custom-sender@example.com');
    assert.strictEqual(capturedMailOptions.subject, 'Transfer Completed');
    assert.ok(capturedMailOptions.html.includes('Transfer Completed'));
    assert.ok(capturedMailOptions.html.includes('Your transfer of $250.00 has completed successfully.'));
    assert.deepStrictEqual(result, { messageId: 'msg-test-123' });
  });

  it('sendNotificationEmail - should fall back to default from address if omitted', async () => {
    let capturedMailOptions = null;
    const mockTransporter = {
      sendMail: mock.fn(async (options) => {
        capturedMailOptions = options;
        return { messageId: 'msg-test-456' };
      })
    };

    await sendNotificationEmail({
      to: 'recipient@example.com',
      subject: 'Fallback Test',
      message: 'Testing default sender.',
      customTransporter: mockTransporter
    });

    assert.strictEqual(mockTransporter.sendMail.mock.callCount(), 1);
    assert.ok(capturedMailOptions.from);
  });
});
