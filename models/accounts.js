import mongoose from 'mongoose';
const { Schema } = mongoose;
import baseSchema from './basePlugin.js';

let accountSchema = new Schema({
    name: { type: String, required: true, get: v => v.trim() },
    email: { type: String, required: true },
    balance: { type: Schema.Types.Decimal128, required: true, default: 10000.00 },
});

// accountSchema.plugin(basePlugin);

accountSchema = baseSchema(accountSchema, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const Account = mongoose.model('Account', accountSchema);
export default Account;