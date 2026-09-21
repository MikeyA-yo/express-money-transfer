import mongoose from 'mongoose';
const { Schema } = mongoose;
import bcrypt from 'bcrypt';
import baseSchema from './basePlugin.js';

let userSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

userSchema.virtual('account', {
    ref: 'Account',
    localField: 'id',
    foreignField: 'userId',
    justOne: true
});

userSchema = baseSchema(userSchema, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

export async function runSeed(nameOrObj, email, accountIdOrPassword, passwordOrHash) {
    let name, userEmail, userAccountId, password, customId;
    if (typeof nameOrObj === 'object' && nameOrObj !== null) {
        ({ name, email: userEmail, accountId: userAccountId, password, id: customId } = nameOrObj);
    } else {
        name = nameOrObj;
        userEmail = email;
        // Support both runSeed(name, email, password) and legacy runSeed(name, email, accountId, password)
        if (passwordOrHash !== undefined) {
            userAccountId = accountIdOrPassword;
            password = passwordOrHash;
        } else {
            password = accountIdOrPassword;
        }
    }

    const isHashed = typeof password === 'string' && password.startsWith('$2b$');
    const passwordHash = isHashed ? password : await bcrypt.hash(password || '123456', 10);

    const user = await User.create({
        id: customId || Date.now().toString() + Math.random().toString(36).slice(2, 8),
        name,
        email: userEmail,
        password: passwordHash
    });

    if (userAccountId) {
        const Account = mongoose.models.Account;
        if (Account) {
            await Account.findOneAndUpdate(
                { id: userAccountId },
                {
                    $set: {
                        name,
                        email: userEmail,
                        userId: user.id,
                        deleted: false
                    },
                    $setOnInsert: {
                        balance: 1000000n,
                        currency: 'USD'
                    }
                },
                { upsert: true, returnDocument: 'after' }
            );
        }
    }

    return user;
}

export default User;