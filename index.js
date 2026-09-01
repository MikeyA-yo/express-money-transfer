import express from "express";
import mongoose from "mongoose";
import accountRoutes from "./routes/accounts.js";
import "dotenv/config";
const app = express();

app.use(express.json());
app.use("/api/v1/accounts", accountRoutes);

app.listen(process.env.PORT ?? 8000, () => {
    console.log(`Server running on port ${process.env.PORT ?? 8000}`);
});
mongoose.connect(process.env.MONGO_URI,{
    retryWrites: true,
    w: "majority"
}).then(() => {
    console.log("Connected to MongoDB");
}).catch((e)=>{
    console.log("Error connecting to MongoDB", e);
});

