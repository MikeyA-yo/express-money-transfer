import mongoose from 'mongoose';
const { Schema } = mongoose;
import baseSchema from './basePlugin.js';

let externalTransferSchema = new Schema({
    fromAccountId: { type: String, required: true, ref: 'Account' },
    userId: { type: String, required: true, ref: 'User' },
    amount: { type: BigInt, required: true },
    currency: { type: String, default: 'NGN' },
    reference: { type: String, required: true, unique: true },
    transferCode: { type: String, sparse: true },
    recipientCode: { type: String },
    recipient: {
        accountNumber: { type: String, required: true },
        bankCode: { type: String, required: true },
        accountName: { type: String, required: true }
    },
    status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED'],
        default: 'PENDING'
    },
    reason: { type: String },
    failureReason: { type: String }
});

externalTransferSchema.pre('validate', function () {
    if (this.amount != null && BigInt(this.amount) <= 0n) {
        throw new Error('External transfer amount must be greater than zero');
    }
});

externalTransferSchema = baseSchema(externalTransferSchema, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const ExternalTransfer = mongoose.models.ExternalTransfer || mongoose.model('ExternalTransfer', externalTransferSchema);
export default ExternalTransfer;
