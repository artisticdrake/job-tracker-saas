import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase, getAuthClient } from './lib/supabase';
import { requireAuth } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));

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
    console.error('Application Update Error:', error.message);
    return res.status(400).json({ success: false, error: error.message });
  }

  console.log('Application updated:', id);
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
    console.error('Profile Save Error:', error.message);
    return res.status(400).json({ success: false, error: error.message });
  }

  console.log('Profile saved successfully!');
  res.json({ success: true, data });
});

// DELETE: Full account wipe
app.delete('/profile', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;

  const { error: appsError } = await supabase
    .from('applications')
    .delete()
    .eq('user_id', userId);

  if (appsError) {
    console.error('Failed to delete applications:', appsError.message);
    return res.status(400).json({ success: false, error: appsError.message });
  }

  // Delete resume files from storage
  const { data: resumeFiles } = await supabase
    .from('resumes')
    .select('storage_path')
    .eq('user_id', userId);

  if (resumeFiles && resumeFiles.length > 0) {
    const paths = resumeFiles.map((r: any) => r.storage_path);
    await supabase.storage.from('resumes').remove(paths);
  }

  // Delete resume rows
  await supabase.from('resumes').delete().eq('user_id', userId);

  const { error: profileError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (profileError) {
    console.error('Failed to delete profile:', profileError.message);
    return res.status(400).json({ success: false, error: profileError.message });
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);

  if (authError) {
    console.error('Failed to delete auth user:', authError.message);
    return res.status(400).json({ success: false, error: authError.message });
  }

  console.log('Account fully deleted for user', userId);
  res.json({ success: true });
});

// ─── RESUMES ────────────────────────────────────────────────────────────────

// GET: List user's resumes
app.get('/resumes', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const authClient = getAuthClient(req.headers.authorization as string);

  const { data, error } = await authClient
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false });

  if (error) return res.status(400).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

// POST: Upload a resume (base64 encoded body)
// Body: { fileName: string, fileType: string, fileData: string (base64) }
app.post('/resumes', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { fileName, fileType, fileData, fileSize } = req.body;

  if (!fileName || !fileType || !fileData) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  // Enforce 3-resume limit
  const { count } = await supabase
    .from('resumes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count ?? 0) >= 3) {
    return res.status(400).json({ success: false, error: 'Resume limit reached. Delete one to upload a new one.' });
  }

  // Upload to Supabase Storage: resumes/{userId}/{timestamp}_{fileName}
  const storagePath = `${userId}/${Date.now()}_${fileName}`;
  const fileBuffer = Buffer.from(fileData, 'base64');

  const { error: storageError } = await supabase.storage
    .from('resumes')
    .upload(storagePath, fileBuffer, {
      contentType: fileType,
      upsert: false,
    });

  if (storageError) {
    console.error('Storage upload error:', storageError.message);
    return res.status(400).json({ success: false, error: storageError.message });
  }

  // Save metadata to resumes table
  const { data, error: dbError } = await supabase
    .from('resumes')
    .insert([{ user_id: userId, file_name: fileName, storage_path: storagePath, file_size: fileSize ?? 0 }])
    .select()
    .single();

  if (dbError) {
    // Clean up the uploaded file if db insert fails
    await supabase.storage.from('resumes').remove([storagePath]);
    console.error('DB insert error:', dbError.message);
    return res.status(400).json({ success: false, error: dbError.message });
  }

  console.log('Resume uploaded:', storagePath);
  res.json({ success: true, data });
});

// GET: Get a signed download URL for a resume
app.get('/resumes/:id/download', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const authClient = getAuthClient(req.headers.authorization as string);

  // Verify ownership
  const { data: resume, error: fetchError } = await authClient
    .from('resumes')
    .select('storage_path, file_name')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !resume) {
    return res.status(404).json({ success: false, error: 'Resume not found' });
  }

  // Generate a signed URL valid for 60 seconds
  const { data: signedUrl, error: urlError } = await supabase.storage
    .from('resumes')
    .createSignedUrl(resume.storage_path, 60);

  if (urlError) {
    return res.status(400).json({ success: false, error: urlError.message });
  }

  res.json({ success: true, url: signedUrl.signedUrl, fileName: resume.file_name });
});

// DELETE: Delete a resume
app.delete('/resumes/:id', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { id } = req.params;
  const authClient = getAuthClient(req.headers.authorization as string);

  // Verify ownership and get storage path
  const { data: resume, error: fetchError } = await authClient
    .from('resumes')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !resume) {
    return res.status(404).json({ success: false, error: 'Resume not found' });
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('resumes')
    .remove([resume.storage_path]);

  if (storageError) {
    console.error('Storage delete error:', storageError.message);
    return res.status(400).json({ success: false, error: storageError.message });
  }

  // Delete from DB
  const { error: dbError } = await authClient
    .from('resumes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (dbError) {
    return res.status(400).json({ success: false, error: dbError.message });
  }

  console.log('Resume deleted:', id);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});