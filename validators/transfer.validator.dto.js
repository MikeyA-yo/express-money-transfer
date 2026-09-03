import * as z from "zod";
import { Decimal128 } from "mongodb";
import logger from "../config/logger.js";
// import transferSchema from "./js";
export const transferSchema = z.object({
    fromAccountId: z.string().min(1, "From account ID is required"),
    toAccountId: z.string().min(1, "To account ID is required"),
    amount: z.number().positive("Amount must be a positive number"),
})

export const transferParams = z.object({
    id: z.string().min(1, "Transfer ID is required"),
})

export function validateTransferParams(schema){
  return (req, res, next) => {
    try {
        const parsed = schema.parse(req.params);
        req.validatedData = parsed;
        next();
    }catch (error) {
        console.log("Validation error:", error.errors);
        logger.error("Validation error:", { errors: error.errors });
        return res.status(400).json({ error: error.errors });
    }
  }
}

export function validateTransfer(schema){
  return (req, res, next) => {
    try {
        const parsed = schema.parse(req.body);
        req.validatedData = parsed;
        next();
    }catch (error) {
        console.log("Validation error:", error.errors);
        logger.error("Validation error:", { errors: error.errors });
        return res.status(400).json({ error: error.errors });
    }
  }

}

const transferDTOSchema =z.object({
    fromAccountId: z.string().min(1, "From account ID is required"),
    toAccountId: z.string().min(1, "To account ID is required"),
  amount: z.instanceof(Decimal128).refine(
    (value) => value.toString() !== "NaN" && Number(value.toString()) > 0,
    "Amount must be a positive number"
  ),
})

export const transferDTO = (data) => {
   try {
    const parsed = transferDTOSchema.parse(data);
     return {
        amount: parsed.amount,
        from: parsed.fromAccountId,
        to: parsed.toAccountId
     }
   }catch (e){
        logger.error("Transfer DTO validation error:", { errors: e.errors });
        throw new Error("Invalid transfer data");
   }
}