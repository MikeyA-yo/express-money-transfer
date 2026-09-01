import mongoose from 'mongoose';
const { Schema } = mongoose;

const accountSchema = new Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    balance: { type: Schema.Types.Decimal128, required: true, default: 10000.00 },
}, {
    timestamps: true
})

const Account = mongoose.model('Account', accountSchema);
export default Account;