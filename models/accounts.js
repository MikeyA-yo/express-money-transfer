import mongoose from 'mongoose';
const { Schema } = mongoose;
import baseSchema from './basePlugin.js';

let accountSchema = new Schema({
    name: { type: String, required: true, get: v => v.trim() },
    email: { type: String, required: true },
    balance: { type: BigInt, required: true, default: 1000000 },
    currency: { type: String, required: true, default: 'USD' },
});

// accountSchema.plugin(basePlugin);

accountSchema = baseSchema(accountSchema, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const Account = mongoose.model('Account', accountSchema);
export default Account;