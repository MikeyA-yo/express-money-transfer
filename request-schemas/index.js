import logger from "../config/logger.js";

/**
 * Validates request data against a zod schema
 * @param {import("zod").ZodSchema} schema - Zod schema to validate with
 * @param {'body' | 'params' | 'query' | 'headers'} options - Request property to validate
 */
export const schemaMiddleware = (schema, options = 'body') => (req, res, next) => {
    try {
        const dataToValidate = options === 'headers' ? req.headers : req[options];
        const parsed = schema.parse(dataToValidate);
        req.validatedData = { ...req.validatedData, ...parsed };
        next();
    } catch (error) {
        const validationErrors = error.errors || error.issues || [{ message: error.message }];
        logger.error("Validation error:", { errors: validationErrors });
        return res.status(400).json({ error: validationErrors });
    }
};