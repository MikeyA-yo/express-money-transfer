import {Schema } from 'mongoose';

const defaultOptions = {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
};

export default function baseSchema(schema, customOptions = {}) {
    // schma.plugin(basePlugin);  
    let initSchema = new Schema({
        id: { type: String, required: true, default: () => Date.now().toString() + Math.random().toString(36).slice(2, 8) },
        deleted: { type: Boolean, default: false },
        schemaVersion: { type: Number, default: 1 },
    }, {
        ...defaultOptions,
        ...customOptions
    });
    return initSchema.add(schema);
}
