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
    });
}