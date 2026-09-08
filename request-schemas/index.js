import { ZodError } from "zod";

/**
 * @{options} - body, params, req
 */
export const schemaMiddleware = (schema, options) =>  (req, res, next) => {
    try{
        
        const parsed = schema.parse(req[options]);
        req.validatedData = parsed;
        next();
    }catch (error) {
        const zoderrs = ZodError(error);
        console.log("Validation error:", zoderrs.errors);
        logger.error("Validation error:", { errors: zoderrs.errors });
        return res.status(400).json({ error: zoderrs.errors });
    }
}