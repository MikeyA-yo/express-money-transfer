import mongoose from 'mongoose';
const { Schema } = mongoose;
import bcrypt from 'bcrypt';
import baseSchema from './basePlugin.js';

let userSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    accountId: { type: String, required: true, unique: true },
});

userSchema = baseSchema(userSchema, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

export async function runSeed(nameOrObj, email, accountId, passwordOrHash) {
    let name, userEmail, userAccountId, password, customId;
    if (typeof nameOrObj === 'object' && nameOrObj !== null) {
        ({ name, email: userEmail, accountId: userAccountId, password, id: customId } = nameOrObj);
    } else {
        name = nameOrObj;
        userEmail = email;
        userAccountId = accountId;
        password = passwordOrHash;
    }

    const isHashed = typeof password === 'string' && password.startsWith('$2b$');
    const passwordHash = isHashed ? password : await bcrypt.hash(password, 10);

    return User.create({
        id: customId || userAccountId || Date.now().toString() + Math.random().toString(36).slice(2, 8),
        name,
        email: userEmail,
        accountId: userAccountId,
        password: passwordHash
    });
}

export default User;