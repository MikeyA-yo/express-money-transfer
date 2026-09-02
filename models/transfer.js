import mongoose from 'mongoose';
const { Schema } = mongoose;
import basePlugin from './basePlugin.js';

const transferSchema = new Schema({
    fromAccountId: { type: String, required: true },
    toAccountId: { type: String, required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
});

transferSchema.plugin(basePlugin);

const Transfer = mongoose.model('Transfer', transferSchema);
export default Transfer;