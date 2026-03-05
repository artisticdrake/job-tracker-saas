import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// 1. Import getAuthClient alongside supabase
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
  // 2. Create an authenticated client using the user's token
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient // <-- Use authClient instead of supabase
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
  
  // 2. Create an authenticated client using the user's token
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient // <-- Use authClient instead of supabase
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
  
  // 2. Create an authenticated client using the user's token
  const authClient = getAuthClient(req.headers.authorization as string);

  const { error } = await authClient // <-- Use authClient instead of supabase
    .from('applications')
    .delete()
    .eq('id', id)
    .eq('user_id', userId); 

  if (error) return res.status(400).json({ success: false, error: error.message });
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});