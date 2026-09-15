import mongoose from 'mongoose';
const { Schema } = mongoose;
import baseSchema from './basePlugin.js';

let transferSchema = new Schema({
    fromAccountId: { type: String, required: true },
    toAccountId: { type: String, required: true },
    amount: { type: BigInt, required: true },
});

transferSchema = baseSchema(transferSchema, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});


const Transfer = mongoose.model('Transfer', transferSchema);
export default Transfer;