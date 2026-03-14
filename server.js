require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.EMP_PORT || 3001;

app.use(cors());
app.use('/api/employee/upload', express.raw({ type: '*/*', limit: '100mb' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/employee', require('./routes/employee'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'employee-dashboard.html')));

app.listen(PORT, () => console.log(`Tax Paladin Employee Portal running on http://localhost:${PORT}`));
