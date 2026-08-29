const express = require('express');
const app = express();

const USERNAME = 'your_username';
const PASSWORD = 'your_password';
const ALLOWED_IP = 'あなたのIPアドレス';

app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) {
    res.set('WWW-Authenticate', 'Basic realm="Restricted Area"');
    return res.status(401).send('認証が必要です');
  }
  const [scheme, encoded] = auth.split(' ');
  if (scheme !== 'Basic') return res.status(401).send('認証が必要です');
  const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
  if (user === USERNAME && pass === PASSWORD) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Restricted Area"');
  res.status(401).send('認証失敗');
});

app.use((req, res, next) => {
  if (req.ip === ALLOWED_IP) {
    next();
  } else {
    res.status(403).send('アクセス拒否');
  }
});

// ...既存のコード...