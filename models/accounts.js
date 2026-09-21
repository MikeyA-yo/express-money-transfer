import mongoose from 'mongoose';
const { Schema } = mongoose;
import baseSchema from './basePlugin.js';

let accountSchema = new Schema({
    name: { type: String, required: true, get: v => v.trim() },
    email: { type: String, required: true },
    balance: { type: BigInt, required: true, default: 1000000n },
    currency: { type: String, required: true, default: 'USD' },
    userId: { type: String, required: true, unique: true, sparse: true, ref: 'User' },
});

accountSchema.virtual('user', {
    ref: 'User',
    localField: 'userId',
    foreignField: 'id',
    justOne: true
});

accountSchema.pre('validate', function () {
    if (this.balance != null && BigInt(this.balance) < 0n) {
        throw new Error('Account balance cannot be negative');
    }
});

// accountSchema.plugin(basePlugin);

accountSchema = baseSchema(accountSchema, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
export default Account;