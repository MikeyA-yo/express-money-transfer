// import { SchemaValidationError } from "zod";

// this can be used for req, params, query, and body validation
const baseValidatorSchema = (schema) => {
    return (req, res, next) => {
        try {
            const parsed = schema.parse(req);
            req.validatedData = parsed;
            next();
        } catch (error) {
            console.log("Validation error:", error.errors);
            return res.status(400).json({ error: error.errors });
        }
    }
}
export default baseValidatorSchema;


// export const curryingFunction = (schema) => (req, res, next) => {
//     try {
//         const parsed = schema.parse(req);   
//     } catch (error) {
//         console.log("Validation error:", error.errors);
//         return res.status(400).json({ error: error.errors });
//     }
// }

// curryingFunction()()