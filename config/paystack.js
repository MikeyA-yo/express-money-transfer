import Paystack from 'paystack-sdk';
import {globalConfig} from '../config/env.js';

const { PAYSTACK_SECRET_KEY } = globalConfig(process);

const paystack = new Paystack(PAYSTACK_SECRET_KEY);

export default paystack;