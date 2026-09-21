import Paystack from 'paystack-sdk';
import {globalConfig} from './env.js';

const { PAYSTACK_TEST_SECRET_KEY} = globalConfig(process);

export const paystack = new Paystack(PAYSTACK_TEST_SECRET_KEY);