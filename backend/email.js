const RESET_LINK_MINUTES = 30;

function emailConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);
}

async function sendPasswordResetEmail(recipient, token) {
  const origin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const url = new URL('/reset-password', origin);
  // Fragments are not sent to Netlify in HTTP requests or access logs.
  url.hash = `token=${token}`;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_FROM, name: 'Connectly' },
      to: [{ email: recipient }],
      subject: 'Reset your Connectly password',
      textContent: `Use this link to reset your Connectly password:\n\n${url}\n\nThe link expires in ${RESET_LINK_MINUTES} minutes and works once. If you did not request this, you can ignore this email.`
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    // Do not print the provider's response; it could contain user information.
    throw new Error(`Brevo rejected password reset email (HTTP ${response.status})`);
  }
}

module.exports = { RESET_LINK_MINUTES, emailConfigured, sendPasswordResetEmail };
