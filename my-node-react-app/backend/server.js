// 📦 Dependencies
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const generateAccessToken = require('./mpesa');
const { initiateStkPush } = require('./mpesa');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 5000;
const uploadsDir = path.join(__dirname, 'uploads');
const stripe = require('stripe')('sk_test_51RsrPAPLkGrqoiEnxcEvS8iBg5tBWMmI1lwa1KYdyeP7wYAC9KPUybFqFMOLjbhzkEXS23CJCPBh1l7j1A5jNE4m00Ec1cCOAp');

// ✅ PostgreSQL connection
const pool = new Pool({
  user: 'postgres', // 
  host: 'localhost',
  database: 'dmi',
  password: 'your_secure_password',
  port: 5432,
});

const {
  DARAJA_CONSUMER_KEY,
  DARAJA_CONSUMER_SECRET,
  BUSINESS_SHORT_CODE,
  PASSKEY,
  CALLBACK_URL
} = process.env;

pool.connect()
  .then(() => console.log('✅ Connected to PostgreSQL'))
  .catch(err => console.error('❌ PostgreSQL connection error:', err));
const JWT_SECRET = 'your_super_secret_key';
// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
bcrypt.hash('secret2025', 10).then(console.log);

// ✅ Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// ✅ Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// ✅ Simple logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ✅ Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// 📌 Event Routes
app.post('/api/events', async (req, res) => {
  const { title, description, date } = req.body;
  if (!title || !description || !date) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const result = await pool.query(
      'INSERT INTO events (title, description, date) VALUES ($1, $2, $3) RETURNING *',
      [title, description, date]
    );
    res.json({ success: true, event: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error saving event' });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM events ORDER BY date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching events' });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving event' });
  }
});

app.put('/api/events/:id', async (req, res) => {
  const { title, description, date } = req.body;
  if (!title || !description || !date) return res.status(400).json({ error: 'All fields required' });

  try {
    const result = await pool.query(
      'UPDATE events SET title = $1, description = $2, date = $3 WHERE id = $4 RETURNING *',
      [title, description, date, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ success: true, event: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error updating event' });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting event' });
  }
});

// 📌 Media Routes
app.post('/api/media/upload', upload.single('file'), async (req, res) => {
  console.log("BODY:", req.body);
  console.log("FILE:", req.file);

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = path.extname(req.file.filename).toLowerCase();
  let type = 'unknown';
  if ([".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext)) type = 'video';
  else if ([".mp3", ".wav", ".ogg", ".m4a"].includes(ext)) type = 'audio';
  else if ([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"].includes(ext)) type = 'image';

  if (type === 'unknown') return res.status(400).json({ error: 'Unsupported file type' });

  const caption = req.body.caption || '';
  const category = req.body.category || 'Uncategorized';
  const filePath = req.file.filename;
  const url = `http://localhost:${PORT}/uploads/${filePath}`;

  try {
    const result = await pool.query(
      'INSERT INTO media (url, type, caption, filePath, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [url, type, caption, filePath, category]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: 'Failed to save media' });
  }
});

app.get('/api/media', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM media ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching media' });
  }
});

app.get('/api/media/:category', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM media WHERE category = $1', [req.params.category]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/media/delete', async (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Missing filePath' });
  const fullPath = path.join(uploadsDir, filePath);

  try {
    await pool.query('DELETE FROM media WHERE filePath = $1', [filePath]);
    fs.unlink(fullPath, err => {
      if (err) return res.status(500).json({ error: 'Failed to delete file' });
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting media' });
  }
});

// 📌 Team Routes
app.get('/api/team', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM team_members ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/team', upload.single('image'), async (req, res) => {
  const { name, title, bio } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : '';
  if (!name || !title || !bio) return res.status(400).json({ error: 'Name, title and bio required' });

  try {
    const result = await pool.query(
      'INSERT INTO team_members (name, title, image, bio) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, title, imagePath, bio]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error saving team member' });
  }
});

app.delete('/api/team/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM team_members WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Team member not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting team member' });
  }
});

// 📌 Static Categories
app.get('/api/categories', (req, res) => {
  res.json(['Stressed', 'Lonely', 'Anxious', 'Encouraged', 'Hopeful', 'Other']);
});

// =======================
// BLOG ROUTES
// =======================

// Create blog (Admin only)
app.post('/api/blogs', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== 'Bearer admin-token') return res.status(403).json({ error: 'Unauthorized' });

  const { title, content, image, author, tags } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO blogs (title, content, image, author, tags) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [title, content, image, author, tags]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating blog:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all blogs
app.get('/api/blogs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM blogs ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching blogs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single blog
app.get('/api/blogs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM blogs WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Blog not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching blog:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update blog (Admin only)
app.put('/api/blogs/:id', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== 'Bearer admin-token') return res.status(403).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const { title, content, image, author, tags } = req.body;
  try {
    const result = await pool.query(
      'UPDATE blogs SET title = $1, content = $2, image = $3, author = $4, tags = $5 WHERE id = $6 RETURNING *',
      [title, content, image, author, tags, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Blog not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating blog:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete blog (Admin only)
app.delete('/api/blogs/:id', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== 'Bearer admin-token') return res.status(403).json({ error: 'Unauthorized' });

  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM blogs WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Blog not found' });
    res.json({ message: 'Blog deleted' });
  } catch (err) {
    console.error('Error deleting blog:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/mpesa/token', async (req, res) => {
  const token = await generateAccessToken();
  if (token) {
    res.json({ access_token: token });
  } else {
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// 1. Get access token
async function getAccessToken() {
  const auth = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: `Basic ${auth}` }
  });
  return res.data.access_token;
}

// 2. Universal Donation Endpoint
app.post('/api/donate', async (req, res) => {
  const { phone, amount } = req.body;

  if (!phone || !amount) {
    return res.status(400).json({ error: "Phone number and amount are required" });
  }

  const formattedPhone = phone.startsWith('254') ? phone : phone.replace(/^0/, '254');

  const response = await initiateStkPush(formattedPhone, amount);
  if (response) {
    res.json(response);
  } else {
    res.status(500).json({ error: "Failed to initiate STK Push" });
  }
});
// 3. Daraja Callback Endpoint (For now just log)
app.post('/api/daraja/callback', (req, res) => {
  console.log('Callback:', JSON.stringify(req.body, null, 2));
  res.status(200).send('OK');
});

app.post('/api/stripe-checkout', async (req, res) => {
  try {
    const { amount } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'kes',
          product_data: {
            name: 'Donation',
          },
          unit_amount: amount * 100, // Stripe uses cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'http://localhost:3000/success',
      cancel_url: 'http://localhost:3000/cancel',
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ message: 'Stripe checkout failed.' });
  }
});

app.post('/create-payment-intent', async (req, res) => {
  const { amount } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // in cents: e.g., 1000 = $10.00
      currency: 'usd',
      payment_method_types: ['card'],
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/stripe-donate', async (req, res) => {
  const { amount } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: parseInt(amount) * 100, // Stripe accepts amount in cents
      currency: 'kes', // Use 'usd' if KES is not enabled on your Stripe account
      payment_method_types: ['card'],
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('Stripe Error:', error);
    res.status(500).send({ error: error.message });
  }
});

// =================== Admin Register (One-time setup) ===================
app.post('/admin/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO admins (email, password) VALUES ($1, $2)',
      [email, hashedPassword]
    );
    res.status(201).send('Admin registered successfully');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error registering admin');
  }
});

// =================== Admin Login ===================
app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = result.rows[0];
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).send('Invalid credentials');
    }

    const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, {
      expiresIn: '1h',
    });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).send('Login error');
  }
});

// =================== Middleware to Protect Admin Routes ===================
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, admin) => {
    if (err) return res.sendStatus(403);
    req.admin = admin;
    next();
  });
}

// =================== Protected Admin Route ===================
app.get('/admin', authenticateAdmin, (req, res) => {
  res.send(`Hello ${req.admin.username}, this is a protected admin area`);
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
