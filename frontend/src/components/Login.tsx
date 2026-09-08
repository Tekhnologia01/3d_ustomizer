import React, { useState } from 'react';
import { apiFetch } from '../utils/apiConfig';
import './Login.css';

interface LoginProps {
    onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showLogin, setShowLogin] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await apiFetch('/api/auth/login/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('access_token', data.access);
                localStorage.setItem('refresh_token', data.refresh);
                onLoginSuccess();
            } else {
                const errData = await res.json();
                setError(errData.detail || 'Invalid credentials. Please try again.');
            }
        } catch (err) {
            setError('Network error. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <header className="landing-nav">
                <div className="landing-brand">
                    <span className="landing-brand-mark">N</span>
                    <span>Neura 3D</span>
                </div>
                <nav className="landing-links" aria-label="Landing page navigation">
                    <a href="#workflow">Workflow</a>
                    <a href="#capabilities">Capabilities</a>
                </nav>
                <button className="landing-login-btn" type="button" onClick={() => { setError(''); setShowLogin(true); }}>
                    Login <span aria-hidden="true">-&gt;</span>
                </button>
            </header>

            <main className="landing-main">
                <section className="landing-hero" id="workflow">
                    <div className="landing-copy">
                        {/* <p className="landing-eyebrow"><span /> PRODUCT CUSTOMIZATION, REFINED</p> */}
                        <h1>Bring every product<br /><strong>to life in 3D.</strong></h1>
                        <p className="landing-description">One calm workspace for product teams to prepare imprint zones, manage color variants, and give customers a confident preview before production.</p>
                        <div className="landing-actions">
                            <button className="landing-primary-btn" type="button" onClick={() => { setError(''); setShowLogin(true); }}>Enter workspace <span aria-hidden="true">-&gt;</span></button>
                            <a className="landing-text-link" href="#capabilities">See how it works <span aria-hidden="true">↓</span></a>
                        </div>
                        <div className="landing-proof"><span className="proof-dot" /> Zones, variants, and 3D previews in one place</div>
                    </div>

                    <div className="landing-preview" aria-label="Product customization workspace preview">
                        <div className="preview-glow preview-glow-coral" />
                        <div className="specimen-board">
                            <div className="specimen-topline"><span>OBJECT / 032</span><span>NEURA STUDIO</span></div>
                            <div className="specimen-art"><span className="specimen-axis axis-x" /><span className="specimen-axis axis-y" /><div className="specimen-shadow" /><div className="specimen-bag"><i className="specimen-handle" /><i className="specimen-pocket" /><i className="specimen-panel" /><span className="specimen-zone"><b /><b /><b /><b /></span></div><span className="measure measure-width">12.0 in</span><span className="measure measure-height">18.4 in</span></div>
                            <div className="specimen-bottomline"><span><i className="status-live" /> READY TO CONFIGURE</span><span>FRONT ELEVATION</span></div>
                        </div>
                        <div className="specimen-note note-top"><b>01</b><span>Placement zone<br /><small>front / centered</small></span></div>
                        <div className="specimen-note note-bottom"><b>04</b><span>Color system<br /><small>4 variants linked</small></span></div>
                    </div>
                </section>

                <section className="landing-stats" id="capabilities">
                    <div><strong>01</strong><span>Prepare once</span><p>Set reusable zones for the products your team sells most.</p></div>
                    <div><strong>02</strong><span>Adapt instantly</span><p>Switch color variants without rebuilding your 3D workflow.</p></div>
                    <div><strong>03</strong><span>Ship with confidence</span><p>Give every design a clear, production-ready preview.</p></div>
                </section>
            </main>

            {showLogin && <div className="login-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowLogin(false); }}>
                <div className="login-form-panel" role="dialog" aria-modal="true" aria-labelledby="login-title">
                    <button className="login-close-btn" type="button" onClick={() => setShowLogin(false)} aria-label="Close login">×</button>
                    <div className="login-form-header">
                        <p className="login-modal-kicker">NEURA 3D WORKSPACE</p>
                        <h2 id="login-title">Welcome back</h2>
                        <p>Sign in to your admin dashboard to continue.</p>
                    </div>

                    {error && (
                        <div className="login-error-box">
                            <span className="error-icon">⚠</span>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="login-form">
                        <div className="login-field">
                            <label>Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="Enter your username"
                                required
                                autoFocus
                                autoComplete="username"
                            />
                        </div>
                        <div className="login-field">
                            <label>Password</label>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    required
                                    autoComplete="current-password"
                                    style={{ paddingRight: '42px', width: '100%' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    style={{
                                        position: 'absolute', right: '12px', background: 'none',
                                        border: 'none', cursor: 'pointer', color: '#94a3b8',
                                        display: 'flex', alignItems: 'center', padding: 0,
                                        transition: 'color 0.15s'
                                    }}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    tabIndex={-1}
                                >
                                    {showPassword ? (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                            <line x1="1" y1="1" x2="23" y2="23" />
                                        </svg>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                        <button type="submit" className="login-submit-btn" disabled={loading}>
                            {loading ? (
                                <>
                                    <span className="login-spinner" />
                                    Authenticating...
                                </>
                            ) : (
                                <>
                                    Sign in <span aria-hidden="true">-&gt;</span>
                                </>
                            )}
                        </button>
                    </form>

                    <p className="login-footer-note">
                        Contact your administrator if you need access.
                    </p>
                </div>
            </div>}
        </div>
    );
}
