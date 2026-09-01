import express from "express";
import mongoose from "mongoose";
import "dotenv/config";
const app = express();

mongoose.connect(process.env.MONGO_URI,{
    retryWrites: true,
    w: "majority"
}).then(() => {
    console.log("Connected to MongoDB");
}).catch((e)=>{
    console.log("Error connecting to MongoDB", e);
});

