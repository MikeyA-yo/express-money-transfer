import mongoose from 'mongoose';
const { Schema } = mongoose;
import baseSchema from './basePlugin.js';


let outboxSchema = new Schema({
    userId: { type: String, required: true, ref: 'User' },
    type: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], default: 'PENDING', index: true }
});

outboxSchema = baseSchema(outboxSchema, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const Outbox = mongoose.models.Outbox || mongoose.model('Outbox', outboxSchema);
export default Outbox;