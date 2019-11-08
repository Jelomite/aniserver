import express from "express";
import twistRouter from "./routers/twist";
import horriblesubsRouter from "./routers/horriblesubs";

const app = express();
const port = process.env.PORT || 12345;

app.use("/twist", twistRouter);
app.use("/horriblesubs", horriblesubsRouter);

app.listen(port, () => console.log(`server started on port ${port}`));
