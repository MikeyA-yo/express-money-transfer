import {Schema } from 'mongoose';

const defaultOptions = {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
};

export default function baseSchema(schema, customOptions = {}) {
    // schma.plugin(basePlugin);  
    let initSchema = new Schema({
        id: { type: String, required: true },
        deleted: { type: Boolean, default: false },
    }, {
        ...defaultOptions,
        ...customOptions
    }

    )  
    return initSchema.add(schema);
   
}
