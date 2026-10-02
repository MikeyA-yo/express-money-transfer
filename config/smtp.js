import { globalConfig } from './env.js';

const host = globalConfig(process).SMTP_HOST;
const port = globalConfig(process).SMTP_PORT;
const user = globalConfig(process).SMTP_USER;
const pass = globalConfig(process).SMTP_PASS;


export const nodemailerConfig = (secure) => ( {
    host,
    port,
    auth: {
        user,
        pass
    },
    secure: secure || (port === 465), // true for 465, false for other ports
})