// server.js
import fetch from 'node-fetch'; // ✅ Only works in modern bundlers like Vite, Webpack, etc.
const express = require('express');
const app = express();

app.get('/deezer', async (req, res) => {
  const query = req.query.q;
  const response = await fetch(`https://api.deezer.com/search?q=${query}`);
  const data = await response.json();
  res.json(data);
});

app.listen(3001, () => console.log('Proxy running on port 3001'));
fetch('https://api.deezer.com/search?q=arijit%20singh')
  .then(res => res.json())
  .then(data => console.log(data));