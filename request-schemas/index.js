import logger from "../config/logger.js";

/**
 * Validates request data against a zod schema
 * @param {import("zod").ZodSchema} schema - Zod schema to validate with
 * @param {'body' | 'params' | 'query'} options - Request property to validate
 */
export const schemaMiddleware = (schema, options) => (req, res, next) => {
    try {
        const parsed = schema.parse(req[options]);
        req.validatedData = parsed;
        next();
    } catch (error) {
        const validationErrors = error.errors || error.issues || [{ message: error.message }];
        logger.error("Validation error:", { errors: validationErrors });
        return res.status(400).json({ error: validationErrors });
    }
};