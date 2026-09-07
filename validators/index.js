// import { SchemaValidationError } from "zod";

// this can be used for req.body, req.params, or req.query validation
const baseValidatorSchema = (schema, source = 'body') => {
    return (req, res, next) => {
        try {
            const dataToValidate = source === 'params' 
                ? req.params 
                : source === 'query' 
                    ? req.query 
                    : req.body;
            const parsed = schema.parse(dataToValidate);
            req.validatedData = parsed;
            next();
        } catch (error) {
            return res.status(400).json({ error: error.errors });
        }
    };
};
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