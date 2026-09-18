import mongoose from 'mongoose';
const { Schema } = mongoose;
import baseSchema from './basePlugin.js';

let idempotencyRecordSchema = new Schema({
    key: { type: String, required: true },
    userId: { type: String, required: true },
    status: {
        type: String,
        required: true,
        enum: ['IN_PROGRESS', 'COMPLETED', 'FAILED'],
        default: 'IN_PROGRESS',
    },
    statusCode: { type: Number },
    responseBody: { type: Schema.Types.Mixed },
    requestFingerprint: { type: String },
    expiresAt: { type: Date, required: true },
});

idempotencyRecordSchema.index({ key: 1, userId: 1 }, { unique: true });
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

idempotencyRecordSchema = baseSchema(idempotencyRecordSchema, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const IdempotencyRecord = mongoose.model('IdempotencyRecord', idempotencyRecordSchema);
export default IdempotencyRecord;
