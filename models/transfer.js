import mongoose from 'mongoose';
const { Schema } = mongoose;

const transferSchema = new Schema({
    id: { type: String, required: true },
    fromAccountId: { type: String, required: true },
    toAccountId: { type: String, required: true },
    amount: { type: Schema.Types.Decimal128, required: true },
}, {
    timestamps: true
});

const Transfer = mongoose.model('Transfer', transferSchema);
export default Transfer;