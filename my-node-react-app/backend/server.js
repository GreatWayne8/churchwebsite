const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// In-memory store for events
let events = [];

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// ✅ Add Event
app.post('/event', upload.single('media'), (req, res) => {
  const { title, date, description } = req.body;
  const media = req.file ? `/uploads/${req.file.filename}` : null;

  if (!title || !date || !description) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const newEvent = {
    id: Date.now().toString(),
    title,
    date,
    description,
    media
  };

  events.push(newEvent);
  res.status(201).json({ message: 'Event created', event: newEvent });
});

// ✏️ Edit Event
app.put('/event/:id', upload.single('media'), (req, res) => {
  const { id } = req.params;
  const { title, date, description } = req.body;

  const index = events.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Event not found' });
  }

  // If new file is uploaded, delete old one
  if (req.file && events[index].media) {
    const oldPath = path.join(__dirname, events[index].media);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  events[index] = {
    ...events[index],
    title: title || events[index].title,
    date: date || events[index].date,
    description: description || events[index].description,
    media: req.file ? `/uploads/${req.file.filename}` : events[index].media
  };

  res.json({ message: 'Event updated', event: events[index] });
});

// ❌ Delete Event
app.delete('/event/:id', (req, res) => {
  const { id } = req.params;
  const index = events.findIndex(e => e.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Event not found' });
  }

  // Delete media file if exists
  const mediaPath = path.join(__dirname, events[index].media || '');
  if (events[index].media && fs.existsSync(mediaPath)) {
    fs.unlinkSync(mediaPath);
  }

  const deletedEvent = events.splice(index, 1);
  res.json({ message: 'Event deleted', event: deletedEvent[0] });
});

// 📄 Get All Events
app.get('/events', (req, res) => {
  res.json(events);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
