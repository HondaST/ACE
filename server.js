require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Raw body parser for file uploads — must come BEFORE express.json() so the
// octet-stream body isn't consumed before the upload route can read it.
app.use('/api/client/upload', express.raw({ type: '*/*', limit: '100mb' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/client', require('./routes/client'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'client-dashboard.html')));

app.listen(PORT, () => console.log(`Tax Paladin running on http://localhost:${PORT}`));
