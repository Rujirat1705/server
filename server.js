const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// ==================== 1. ตั้งค่าการส่งอีเมลผ่าน Gmail SMTP ====================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: '67310078@go.buu.ac.th',
    pass: 'hbkzvsnxvzwrdjar'
  }
});

// ==================== 2. API ระบบหนังสือ ====================
app.get('/api/books', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM books ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/books', async (req, res) => {
  try {
    const { title, author, price, stock, category } = req.body;
    const [result] = await db.query(
      'INSERT INTO books (title, author, price, stock, category) VALUES (?, ?, ?, ?, ?)',
      [title, author, price, stock, category]
    );
    res.status(201).json({ id: result.insertId, title, author, price, stock, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/books/:id', async (req, res) => {
  try {
    const { title, author, price, stock, category } = req.body;
    await db.query(
      'UPDATE books SET title = ?, author = ?, price = ?, stock = ?, category = ? WHERE id = ?',
      [title, author, price, stock, category, req.params.id]
    );
    res.json({ message: 'อัปเดตเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/books/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM books WHERE id = ?', [req.params.id]);
    res.json({ message: 'ลบเรียบร้อย' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 3. API ระบบสมัครสมาชิกและยืนยันตัวตน ====================

// POST /api/register - สมัครสมาชิก + ส่งอีเมลยืนยันตัวตน
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. ตรวจสอบอีเมลซ้ำในฐานข้อมูล
    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }

    // 2. สร้าง Token และบันทึกลง Database
    const token = crypto.randomBytes(20).toString('hex');
    await db.query(
      'INSERT INTO users (name, email, password, is_verified, verification_token) VALUES (?, ?, ?, false, ?)',
      [name, email, password, token]
    );

    // 3. สร้างลิงก์ยืนยันตัวตน (ยิงมาที่ Backend Port 5000)
    const verifyLink = `http://localhost:5000/api/verify-email?token=${token}`;

    // 4. ตั้งค่าอีเมล
    const mailOptions = {
      from: '"Book Store System" <67310078@go.buu.ac.th>',
      to: email,
      subject: 'กรุณายืนยันตัวตนสำหรับสมัครสมาชิก - Book Store',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px; max-width: 500px;">
          <h2 style="color: #007bff;">ยินดีต้อนรับคุณ ${name} 👋</h2>
          <p>ขอบคุณที่สมัครสมาชิกกับ Book Store กรุณาคลิกลิงก์ด้านล่างเพื่อยืนยันตัวตนของคุณ:</p>
          <div style="margin: 25px 0;">
            <a href="${verifyLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              คลิกที่นี่เพื่อยืนยันตัวตน
            </a>
          </div>
          <p style="color: #666; font-size: 13px;">หากปุ่มด้านบนใช้งานไม่ได้ ให้คัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br>
          <a href="${verifyLink}">${verifyLink}</a></p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({
      message: `ลงทะเบียนสำเร็จ! ส่งลิงก์ยืนยันตัวตนไปที่ ${email} เรียบร้อยแล้ว กรุณาเช็คในกล่องข้อความ (Inbox) หรือ จดหมายขยะ (Spam)`
    });

  } catch (err) {
    console.error('Register/Mail Error:', err);
    res.status(500).json({ error: 'ไม่สามารถส่งอีเมลได้: ' + err.message });
  }
});

// GET /api/verify-email - ยืนยันตัวตนสำเร็จแล้วเปลี่ยนหน้าไปยัง Login
app.get('/api/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send('<h2>ไม่พบ Token ในการยืนยันตัวตน</h2>');

    const [users] = await db.query('SELECT * FROM users WHERE verification_token = ?', [token]);
    if (users.length === 0) {
      return res.status(400).send('<h2>Token ไม่ถูกต้องหรือถูกใช้งานไปแล้ว</h2>');
    }

    // อัปเดตสถานะการยืนยันตัวตนในฐานข้อมูล
    await db.query(
      'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = ?',
      [users[0].id]
    );

    // แสดงข้อความยืนยันสำเร็จ และย้ายผู้ใช้ไปหน้า Login (Port 3000) ใน 3 วินาที
    res.send(`
      <div style="text-align: center; margin-top: 60px; font-family: Arial, sans-serif;">
        <h1 style="color: #28a745; font-size: 28px;">ยืนยันตัวตนสำเร็จแล้ว! 🎉</h1>
        <p style="font-size: 16px; color: #555;">ระบบกำลังนำคุณไปยังหน้าเข้าสู่ระบบภายใน 3 วินาที...</p>
        <p style="font-size: 14px; color: #888;">หากหน้าเว็บไม่เปลี่ยนให้อัตโนมัติ <a href="http://localhost:3000/login" style="color: #007bff;">คลิกที่นี่</a></p>
        <script>
          setTimeout(() => {
            window.location.href = 'http://localhost:3000/login';
          }, 3000);
        </script>
      </div>
    `);

  } catch (err) {
    res.status(500).send('เกิดข้อผิดพลาดในการยืนยันตัวตน: ' + err.message);
  }
});

// POST /api/login - เข้าสู่ระบบ
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const [users] = await db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const user = users[0];

    if (!user.is_verified) {
      return res.status(403).json({ error: 'กรุณายืนยันตัวตนผ่านอีเมลก่อนเข้าสู่ระบบ' });
    }

    res.json({
      message: 'เข้าสู่ระบบสำเร็จ',
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend Server running on http://localhost:${PORT}`);
});