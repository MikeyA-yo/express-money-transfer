import * as z from 'zod';

export const externalTransferSchema = z.object({
    fromAccountId: z.string().min(1, 'From Account ID is required'),
    amountMinor: z
        .number()
        .positive('Amount must be a positive number')
        .int('Amount must be an integer')
        .min(100, 'Amount must be at least 100 minor units (1.00)'),
    recipientAccountNumber: z
        .string()
        .regex(/^\d{10}$/, 'Recipient account number must be exactly 10 digits'),
    recipientBankCode: z.string().min(1, 'Recipient bank code is required'),
    recipientName: z.string().min(1, 'Recipient account name is required'),
    reason: z.string().max(100, 'Reason cannot exceed 100 characters').optional()
});

export const resolveAccountQuerySchema = z.object({
    accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be exactly 10 digits'),
    bankCode: z.string().min(1, 'Bank code is required')
});

export const externalTransferParams = z.object({
    id: z.string().min(1, 'External transfer ID is required')
});
