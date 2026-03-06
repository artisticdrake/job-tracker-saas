import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase, getAuthClient } from './lib/supabase';
import { requireAuth } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// GET: Fetch all applications for the logged-in user
app.get('/applications', requireAuth, async (req, res) => {
  const userId = (req as any).user.id; 
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient
    .from('applications')
    .select('*')
    .eq('user_id', userId)
    .order('last_updated', { ascending: false });

  if (error) return res.status(400).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

// POST: Create a new application
app.post('/applications', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const payload = req.body;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient
    .from('applications')
    .insert([{ ...payload, user_id: userId }])
    .select()
    .single();

  if (error) return res.status(400).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

// DELETE: Remove an application
app.delete('/applications/:id', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { error } = await authClient
    .from('applications')
    .delete()
    .eq('id', id)
    .eq('user_id', userId); 

  if (error) return res.status(400).json({ success: false, error: error.message });
  res.json({ success: true });
});

// GET: Fetch user profile — returns theme_settings, display_name, avatar_id, created_at
app.get('/profile', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient
    .from('profiles')
    .select('id, theme_settings, display_name, avatar_id, created_at') // ← explicit columns
    .eq('id', userId)
    .single();

  if (error) return res.status(400).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

// PUT: Update user profile — accepts theme_settings, display_name, avatar_id
app.put('/profile', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { theme_settings, display_name, avatar_id } = req.body; // ← destructure all three
  const authClient = getAuthClient(req.headers.authorization as string);

  // Build the update payload — only include fields that were actually sent
  const payload: Record<string, any> = { id: userId };
  if (theme_settings !== undefined) payload.theme_settings = theme_settings;
  if (display_name  !== undefined) payload.display_name  = display_name;
  if (avatar_id     !== undefined) payload.avatar_id     = avatar_id;

  const { data, error } = await authClient
    .from('profiles')
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error("❌ Profile Save Error:", error.message);
    return res.status(400).json({ success: false, error: error.message });
  }
  
  console.log("✅ Profile saved successfully!");
  res.json({ success: true, data });
});

// DELETE: Wipe a user's profile row (triggered from danger zone)
app.delete('/profile', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { error } = await authClient
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (error) {
    console.error("❌ Profile Delete Error:", error.message);
    return res.status(400).json({ success: false, error: error.message });
  }

  console.log("✅ Profile deleted.");
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});