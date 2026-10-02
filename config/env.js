import 'dotenv/config';
import {parseEnv} from 'znv';
import { z } from 'zod';    

export const globalConfig = (process) => {
    return parseEnv(process.env,{
        PORT: z.number().default(8000),
        MONGODB_URI: z.string().url(),
        REDIS_URL: z.string().url(),
        PAYSTACK_TEST_PUBLIC_KEY: z.string(),
        PAYSTACK_TEST_SECRET_KEY: z.string(),
        SMTP_HOST: z.string(),
        SMTP_PORT: z.number(),
        SMTP_USER: z.string(),
        SMTP_PASS: z.string(),
    });
}