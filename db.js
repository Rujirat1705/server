const mysql = require('mysql2');

// สร้าง Connection Pool สำหรับเชื่อมต่อ MySQL
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',      // แก้ไขเป็น Username MySQL ของคุณ
  password: '',      // แก้ไขเป็น Password MySQL ของคุณ
  database: 'bookstore_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool.promise();