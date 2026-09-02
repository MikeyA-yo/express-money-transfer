import mongoose from 'mongoose';
const { Schema } = mongoose;
import basePlugin from './basePlugin.js';

const accountSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    balance: { type: Schema.Types.Decimal128, required: true, default: 10000.00 },
});

accountSchema.plugin(basePlugin);

const Account = mongoose.model('Account', accountSchema);
export default Account;