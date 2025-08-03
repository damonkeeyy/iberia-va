require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const qs = require('querystring');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf-8'));
}

function saveJSON(file, data) {
  fs.writeFileSync(path.join(__dirname, 'data', file), JSON.stringify(data, null, 2));
}

// Home
app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.redirect('/dashboard');
});

// Discord Login
app.get('/login', (req, res) => {
  const params = qs.stringify({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify'
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// OAuth callback
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code provided');

  try {
    const tokenRes = await axios.post(
      'https://discord.com/api/oauth2/token',
      qs.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        scope: 'identify'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
    });

    const user = userRes.data;
    req.session.user = user;

    // store user if new
    let users = loadJSON('users.json');
    if (!users.find(u => u.id === user.id)) {
      users.push({ id: user.id, username: user.username, flights: [] });
      saveJSON('users.json', users);
    }

    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.send('OAuth login failed.');
  }
});

// Dashboard
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.send(`
    <h1>Welcome ${req.session.user.username}</h1>
    <a href="/book">Book a flight</a> | <a href="/checkin">Check in</a>
  `);
});

// Book flight
app.get('/book', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const routes = loadJSON('routes.json');
  const aircraft = ["A350", "A320", "B757", "B727"];
  res.send(`
    <form action="/book" method="POST">
      From: <select name="from">${routes.map(r => `<option>${r.code}</option>`).join('')}</select><br>
      To: <select name="to">${routes.map(r => `<option>${r.code}</option>`).join('')}</select><br>
      Aircraft: <select name="aircraft">${aircraft.map(a => `<option>${a}</option>`).join('')}</select><br>
      <button type="submit">Book</button>
    </form>
  `);
});

app.post('/book', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  let flights = loadJSON('flights.json');
  const id = Date.now();
  const flight = {
    id,
    userId: req.session.user.id,
    from: req.body.from,
    to: req.body.to,
    aircraft: req.body.aircraft,
    status: "booked"
  };
  flights.push(flight);
  saveJSON('flights.json', flights);
  res.send(`<p>Flight booked! ID: ${id}</p><a href="/dashboard">Back to dashboard</a>`);
});

// Checkin
app.get('/checkin', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.send(`
    <form action="/checkin" method="POST">
      Flight ID: <input name="id"><br>
      <button type="submit">Check In</button>
    </form>
  `);
});

app.post('/checkin', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  let flights = loadJSON('flights.json');
  const id = parseInt(req.body.id);
  const flight = flights.find(f => f.id === id && f.userId === req.session.user.id);
  if (!flight) return res.send('Flight not found.');
  flight.status = 'completed';
  saveJSON('flights.json', flights);
  res.send(`<p>Checked in successfully!</p><a href="/dashboard">Back</a>`);
});

// start server
app.listen(3000, () => console.log("✅ Iberia VA backend running on http://localhost:3000"));
