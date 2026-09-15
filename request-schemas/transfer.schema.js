import * as z from "zod";

export const transferSchema = z.object({
    fromAccountId: z.string().min(1, "From Account ID is required"),
    toAccountId: z.string().min(1, "To Account ID is required"),
    amountMinor: z.number().positive("Amount must be a positive number").int("Amount must be an integer").min(1, "Amount must be at least 1"),
}).refine((data) => data.fromAccountId !== data.toAccountId, {
    message: "Cannot transfer to the same account",
    path: ["toAccountId"],
});

export const transferParams = z.object({
    id: z.string().min(1, "Transfer ID is required"),
});