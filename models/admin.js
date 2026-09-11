import mongoose from 'mongoose';
const { Schema } = mongoose;
import bcrypt from 'bcrypt';
import baseSchema from './basePlugin.js';

let adminSchema = new Schema({
    email: { type: String, required: true, unique: true },
    role: { type: String, required: true, enum: ['admin', 'superadmin'] },
    password: { type: String, required: true },
});

adminSchema = baseSchema(adminSchema, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

export async function runSeed(email, role, passwordOrHash) {
    const isHashed = typeof passwordOrHash === 'string' && passwordOrHash.startsWith('$2b$');
    const passwordHash = isHashed ? passwordOrHash : await bcrypt.hash(passwordOrHash, 10);

    return Admin.create({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
        email,
        role,
        password: passwordHash
    });
}

export default Admin;