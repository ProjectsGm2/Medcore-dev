import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

router.post('/invokeLLM', requireAuth, async (req, res) => {
  const { prompt, response_json_schema } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ message: 'prompt is required' });
  }

  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    return res.status(503).json({ message: 'AI is not configured (OPENAI_API_KEY missing)' });
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const body = {
    model,
    messages: [
      { role: 'system', content: 'You are a clinical AI assistant. Return JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
  };

  // Best-effort JSON schema guidance for newer models; if the API rejects it, we fall back.
  if (response_json_schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'diagnosis_result',
        schema: response_json_schema,
        strict: false,
      },
    };
  } else {
    body.response_format = { type: 'json_object' };
  }

  let data;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    data = text ? JSON.parse(text) : null;
    if (!r.ok) {
      return res.status(502).json({ message: data?.error?.message || 'LLM request failed', provider: data });
    }
  } catch (err) {
    return res.status(502).json({ message: err.message || 'LLM request failed' });
  }

  const content = data?.choices?.[0]?.message?.content || '';
  try {
    return res.json(JSON.parse(content));
  } catch {
    // If the model returned non-JSON, return it in a structured way.
    return res.json({ raw: content });
  }
});

// Video room / signaling helper
router.post('/videoRoom', requireAuth, async (req, res) => {
  const { appointment_id, action } = req.body;
  if (!appointment_id) {
    return res.status(400).json({ message: 'appointment_id required' });
  }

  const [appointments] = await pool.query('SELECT * FROM appointments WHERE id = ?', [appointment_id]);
  const appointment = appointments[0];
  if (!appointment) {
    return res.status(404).json({ message: 'Appointment not found' });
  }

  // Allow doctor of the appointment, or admin, or receptionist
  const allowedRoles = ['admin', 'receptionist'];
  const allowed = allowedRoles.includes(req.user.role) || appointment.doctor_id === req.user.id;
  if (!allowed) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  if (action === 'create_room') {
    const roomId = `medcore-${appointment_id.slice(-8)}-${(appointment.appointment_date || '').replace(/[-:T\.]/g, '') || 'room'}`;
    await pool.query('UPDATE appointments SET video_room_id = ?, video_status = ? WHERE id = ?', [roomId, 'active', appointment_id]);
    return res.json({ room_id: roomId, appointment });
  }

  if (action === 'end_room') {
    await pool.query('UPDATE appointments SET video_status = ? WHERE id = ?', ['ended', appointment_id]);
    return res.json({ success: true });
  }

  return res.json({ room_id: appointment.video_room_id, video_status: appointment.video_status });
});

export default router;
