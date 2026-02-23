import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRouter from './routes/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', authRouter);

app.listen(PORT, () => {
  console.log(`Tax Paladin server running at http://localhost:${PORT}`);
});

export default app;
