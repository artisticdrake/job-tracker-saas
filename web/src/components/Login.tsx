import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Sparkles } from 'lucide-react';

export default function Login() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin // Returns to localhost:5173 after login
      }
    });
    if (error) alert(error.message);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1020] text-white font-sans">
      <div className="w-full max-w-md p-8 bg-[#0f1730] rounded-xl border border-slate-800 shadow-2xl text-center">
        <div className="mb-6 flex justify-center">
          <div className="p-3 bg-indigo-500/10 rounded-full">
            <Sparkles className="w-8 h-8 text-indigo-500" />
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-2">Job Tracker</h1>
        <p className="text-slate-400 mb-8">Sign in to sync your applications.</p>
        
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 px-4 bg-white text-black font-semibold rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? 'Connecting...' : 'Sign in with Google'}
        </button>
      </div>
    </div>
  );
}