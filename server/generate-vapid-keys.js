// generate-vapid-keys.js
// Ejecuta una sola vez: npm run generate-keys
// Copia el resultado a tu archivo .env

const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('\nGuarda esto en tu archivo .env:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('\nY copia VAPID_PUBLIC_KEY dentro de app.js, en la constante VAPID_PUBLIC_KEY.\n');
