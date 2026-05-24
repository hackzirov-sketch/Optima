const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'elbek6831@gmail.com',
    pass: 'uwgiwmpejiylqyjs'
  }
});

async function main() {
  try {
    const info = await transporter.sendMail({
      from: '"UPZ Test" <elbek6831@gmail.com>',
      to: 'selfteach4@gmail.com',
      subject: 'Test Email from UPZ Backend',
      text: 'This is a test email.',
    });
    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

main();
