const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = 5000;
const uploadsDir = path.join(__dirname, 'uploads');

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// ✅ MongoDB connection
mongoose.connect('mongodb://localhost:27017/dmi', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ Mongoose Schemas
const eventSchema = new mongoose.Schema({
  title: String,
  date: String,
  description: String
});

const mediaSchema = new mongoose.Schema({
  url: String,
  type: String,
  caption: String,
  filePath: String,
  category: String // 👈 Add this!

});

const Event = mongoose.model('Event', eventSchema);
const Media = mongoose.model('Media', mediaSchema);

// ✅ Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// ✅ Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// ✅ Logger Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ✅ Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// 📌 Create new event
app.post('/api/events', async (req, res) => {
  try {
    const { title, description, date } = req.body;

    if (!title || !description || !date) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const newEvent = new Event({ title, description, date });
    await newEvent.save();

    res.json({ success: true, event: newEvent });
  } catch (err) {
    console.error('Error saving event:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// 📌 Get all events
app.get('/api/events', async (req, res) => {
  try {
    const events = await Event.find().sort({ date: -1 });
    console.log("Admin event POST request received:", req.body);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching events' });
  }
});
// 📌 Get single event by ID (optional)
app.get('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving event' });
  }
});

// 📌 Update an event
app.put('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  const { title, date, description } = req.body;

  if (!title || !date || !description) {
    return res.status(400).json({ success: false, message: 'All fields required' });
  }

  try {
    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      { title, date, description },
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, event: updatedEvent });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error updating event' });
  }
});

// 📌 Delete an event
app.delete('/api/events/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await Event.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting event' });
  }
});

// 📌 Get all media
app.get('/api/media', async (req, res) => {
  try {
    const media = await Media.find().sort({ _id: -1 });
    res.json(media);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching media' });
  }
});

// 📌 Upload media
app.post('/api/media/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = path.extname(req.file.filename).toLowerCase();
  let type = 'unknown';

  if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
    type = 'video';
  } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
    type = 'audio';
  } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
    type = 'image';
  }
  if (type === 'unknown') {
    return res.status(400).json({ error: 'Unsupported file type' });
  }
  const caption = req.body.caption || '';
  const category = req.body.category || 'Uncategorized'; // 👈 Default fallback
  const filePath = req.file.filename;
  const url = `http://localhost:${PORT}/uploads/${filePath}`;

  try {
    const mediaItem = await Media.create({ url, type, caption, filePath, category });
    res.json(mediaItem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save media' });
  }
});

// Get all media under a category (caption group)
app.get('/api/media/:category', async (req, res) => {
  try {
    const category = req.params.category;
    const media = await Media.find({ category });
    res.json(media);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Delete media
app.post('/api/media/delete', async (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'No filePath provided' });

  const fullPath = path.join(uploadsDir, filePath);

  try {
    await Media.deleteOne({ filePath });
    fs.unlink(fullPath, err => {
      if (err) return res.status(500).json({ error: 'Error deleting file from disk' });
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting media' });
  }
});

// ✅ Start server
app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
