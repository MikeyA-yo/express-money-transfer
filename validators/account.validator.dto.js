import * as Z from "zod";

export const accountSchema = Z.object({
    name: Z.string().min(1, "Name is required"),
    email: Z.string().email("Invalid email address"),
    balance: Z.number().min(0, "Balance must be a non-negative number"),
})
 
export const accountParams = Z.object({
    id: Z.string().min(1, "Account ID is required"),
})

export function validateAccount(schema){
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

export function validateAccountParams(schema){
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