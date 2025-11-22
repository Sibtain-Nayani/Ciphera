import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import ShieldIcon from '../../components/ShieldIcon';

const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .533 5.333.533 12S5.867 24 12.48 24c3.44 0 6.053-1.147 7.92-3.067 1.92-1.92 2.507-4.64 2.507-6.8 0-.693-.053-1.36-.16-2.027H12.48z" />
  </svg>
);
const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.74 1.18 0 2.45-1.62 4.37-1.62 1.71.09 3.07.84 3.75 1.8-3.39 1.83-2.8 6.87 1.1 8.5-.75 1.91-1.83 3.61-4.3 3.55zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.54 4.33-3.74 4.25z" />
  </svg>
);
const GithubIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/token', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Something went wrong');
      }

      console.log('Login successful:', data);
      localStorage.setItem('token', data.access_token);
      navigate('/dashboard');

    } catch (err) {
      setError(err.message || 'An unknown error occurred.');
      console.error('Login failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#2d2d2d,_#121212)] px-4">
      <div className="w-full max-w-[390px] rounded-[32px] border border-white/10 bg-base-800/80 p-8 shadow-card backdrop-blur-2xl">
        <div className="flex h-full flex-col justify-between space-y-8">
          {/* Top Section - Branding */}
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#FFA500]/30 bg-base-700/60">
                <ShieldIcon className="w-10 h-10 text-[#FFA500]" />
              </div>
            </div>
            <h1 className="font-display text-5xl font-bold text-white">Ciphera</h1>
            <p className="font-display text-3xl mt-4 text-white/90">Welcome</p>
          </div>

          {/* Middle Section - Form */}
          <div className="w-full">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="email"
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="Email Address"
              />
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-label="Password"
              />
              <div className="text-right">
                <a href="#" className="text-xs font-semibold text-white/70 hover:text-accent transition-colors">
                  Forgot password?
                </a>
              </div>
              <Button
                type="submit"
                className="w-full transform transition-all duration-200 border border-accent bg-transparent text-white hover:bg-accent hover:text-base-900 font-bold hover:scale-[1.02] hover:shadow-lg hover:shadow-accent/20 active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? 'Logging in...' : 'Login'}
              </Button>
              {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
            </form>
          </div>

          {/* Bottom Section - Social Login */}
          <div className="w-full space-y-6">
            <p className="text-sm text-center text-white/60">
              Not a member?{' '}
              <Link to="#" className="font-semibold text-white hover:text-accent transition-colors">
                Register now
              </Link>
            </p>

            <div className="flex items-center">
              <hr className="flex-grow border-t border-white/20" />
              <span className="mx-4 text-xs text-white/50 flex-shrink-0">Or continue with</span>
              <hr className="flex-grow border-t border-white/20" />
            </div>

            <div className="flex justify-center space-x-4">
              <SocialButton icon={<GoogleIcon />} alt="Google" />
              <SocialButton icon={<AppleIcon />} alt="Apple" />
              <SocialButton icon={<GithubIcon />} alt="Github" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SocialButton = ({ icon, alt }) => (
  <button
    aria-label={alt}
    className="bg-white/5 border border-white/20 rounded-full h-12 w-12 flex items-center justify-center hover:bg-white/10 hover:border-accent/50 transition-all"
  >
    {icon}
  </button>
);
