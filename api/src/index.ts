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

// PUT: Update an existing application
app.put('/applications/:id', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const payload = req.body;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient
    .from('applications')
    .update({ ...payload, last_updated: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error("Application Update Error:", error.message);
    return res.status(400).json({ success: false, error: error.message });
  }

  console.log("Application updated:", id);
  res.json({ success: true, data });
});

// DELETE: Remove a single application
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

// GET: Fetch user profile
app.get('/profile', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient
    .from('profiles')
    .select('id, theme_settings, display_name, avatar_id, created_at')
    .eq('id', userId)
    .single();

  if (error) return res.status(400).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

// PUT: Update user profile
app.put('/profile', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { theme_settings, display_name, avatar_id } = req.body;
  const authClient = getAuthClient(req.headers.authorization as string);

  const payload: Record<string, any> = { id: userId };
  if (theme_settings !== undefined) payload.theme_settings = theme_settings;
  if (display_name !== undefined) payload.display_name = display_name;
  if (avatar_id !== undefined) payload.avatar_id = avatar_id;

  const { data, error } = await authClient
    .from('profiles')
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error("Profile Save Error:", error.message);
    return res.status(400).json({ success: false, error: error.message });
  }

  console.log("Profile saved successfully!");
  res.json({ success: true, data });
});

// DELETE: Full account wipe
// Uses admin supabase client (service role) for ALL steps — not authClient.
// authClient is bound by RLS and cannot reliably delete rows.
// Also, the FK constraint profiles.id -> auth.users.id means deleteUser will
// throw "Database error deleting user" if the profile row still exists.
// Correct order: applications -> profile row -> auth user.
app.delete('/profile', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;

  // Step 1: Delete all applications
  const { error: appsError } = await supabase
    .from('applications')
    .delete()
    .eq('user_id', userId);

  if (appsError) {
    console.error("Failed to delete applications:", appsError.message);
    return res.status(400).json({ success: false, error: appsError.message });
  }
  console.log("Applications deleted for", userId);

  // Step 2: Delete profile row — must be gone before deleteUser
  const { error: profileError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (profileError) {
    console.error("Failed to delete profile:", profileError.message);
    return res.status(400).json({ success: false, error: profileError.message });
  }
  console.log("Profile row deleted for", userId);

  // Step 3: Delete auth user — safe now, no FK refs remain
  const { error: authError } = await supabase.auth.admin.deleteUser(userId);

  if (authError) {
    console.error("Failed to delete auth user:", authError.message);
    return res.status(400).json({ success: false, error: authError.message });
  }

  console.log("Account fully deleted for user", userId);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});