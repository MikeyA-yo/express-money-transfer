import * as z from "zod";

export const createAccountSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    balance: z.number().min(0, "Balance must be a non-negative number"),
    userId: z.string().min(1, "User ID is required"),
});

export const getAccountSchema = createAccountSchema;

export const accountParams = z.object({
    id: z.string().min(1, "Account ID is required"),
});
