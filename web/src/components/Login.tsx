import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Briefcase } from 'lucide-react';

export default function Login() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    
    if (error) {
      alert(error.message);
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0d1117', // GitHub dark background
      color: '#c9d1d9',      // GitHub text color
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
    }}>
      
      {/* Logo and Header */}
      <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Briefcase size={48} color="#c9d1d9" style={{ marginBottom: '16px' }} />
        <h1 style={{ fontSize: '24px', fontWeight: 300, margin: 0, letterSpacing: '-0.5px' }}>
          Sign in to Job Tracker
        </h1>
      </div>

      {/* Main Login Panel */}
      <div style={{
        background: '#161b22', // GitHub panel color
        padding: '20px',
        borderRadius: '6px',
        border: '1px solid #30363d',
        width: '100%',
        maxWidth: '300px',
      }}>
        
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '6px 16px',
            fontSize: '14px',
            fontWeight: 500,
            lineHeight: '20px',
            color: '#c9d1d9',
            backgroundColor: '#21262d',
            border: '1px solid rgba(240, 246, 252, 0.1)',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: '80ms cubic-bezier(0.33, 1, 0.68, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
          onMouseOver={(e) => {
            if(!loading) {
              e.currentTarget.style.backgroundColor = '#30363d';
              e.currentTarget.style.borderColor = '#8b949e';
            }
          }}
          onMouseOut={(e) => {
            if(!loading) {
              e.currentTarget.style.backgroundColor = '#21262d';
              e.currentTarget.style.borderColor = 'rgba(240, 246, 252, 0.1)';
            }
          }}
        >
          {/* Official Google 'G' SVG Logo */}
          <svg height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loading ? 'Redirecting...' : 'Sign in with Google'}
        </button>
      </div>

      {/* Bottom Callout */}
      <div style={{
        marginTop: '16px',
        padding: '16px',
        fontSize: '12px',
        border: '1px solid #30363d',
        borderRadius: '6px',
        width: '100%',
        maxWidth: '300px',
        textAlign: 'center'
      }}>
        New to Job Tracker? <span onClick={handleLogin} style={{ color: '#58a6ff', cursor: 'pointer', textDecoration: 'none' }}>Create an account</span>.
      </div>
    </div>
  );
}