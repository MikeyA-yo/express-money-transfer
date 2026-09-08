import * as z from "zod";

export const transferSchema = z.object({
    fromAccountId: z.string().min(1, "From Account ID is required"),
    toAccountId: z.string().min(1, "To Account ID is required"),
    amount: z.number().min(0.10, "Amount must be a positive number"),
});

export const transferParams = z.object({
    id: z.string().min(1, "Transfer ID is required"),
});