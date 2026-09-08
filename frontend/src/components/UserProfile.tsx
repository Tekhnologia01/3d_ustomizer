import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiConfig';

interface UserProfileProps {
    onBack?: () => void;
    showToast: (msg: string) => void;
    onLogout?: () => void;
}

const UP_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

.up-root {
    font-family: 'Inter', sans-serif;
    background: #f8fafc;
    min-height: 100vh;
    padding: 2.5rem 2rem;
    display: flex;
    justify-content: center;
}

.up-container {
    width: 100%;
    max-width: 580px;
}

.up-header {
    text-align: center;
    margin-bottom: 2.5rem;
}

.up-header h1 {
    font-size: 1.85rem;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.02em;
    margin-bottom: 0.5rem;
}

.up-header p {
    color: #64748b;
    font-size: 0.95rem;
}

.up-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 2.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
}

.up-field-group {
    display: grid;
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.up-form-field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.up-form-field label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.up-form-field input {
    width: 100%;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    color: #0f172a;
    font-size: 0.95rem;
    font-family: inherit;
    transition: all 0.2s;
    box-sizing: border-box;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
}

.up-form-field input:focus {
    outline: none;
    background: #ffffff;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.up-divider {
    height: 1px;
    background: #e2e8f0;
    margin: 2rem 0;
    border: none;
}

.up-section-title {
    font-size: 1.05rem;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 1.25rem;
}

.up-btn-primary {
    width: 100%;
    padding: 0.85rem;
    background: #0f172a;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.2s;
    margin-top: 1rem;
}

.up-btn-primary:hover {
    background: #1e293b;
}

.up-btn-primary:disabled {
    background: #94a3b8;
    cursor: not-allowed;
}

@media (max-width: 640px) {
    .up-card {
        padding: 1.5rem;
    }
    .up-root {
        padding: 1.5rem 1rem;
    }
}
`;

export default function UserProfile({ onBack, showToast }: UserProfileProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [userData, setUserData] = useState({
        username: '',
        email: '',
    });
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    useEffect(() => {
        apiFetch('/api/auth/me/')
            .then(res => res.json())
            .then(data => {
                setUserData({ username: data.username || '', email: data.email || '' });
                setLoading(false);
            })
            .catch(() => {
                showToast("Failed to load profile.");
                setLoading(false);
            });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUserData({ ...userData, [e.target.name]: e.target.value });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password && password !== confirmPassword) {
            showToast("Passwords do not match");
            return;
        }

        setSaving(true);
        try {
            const body = {
                ...userData,
                ...(password ? { password } : {})
            };
            const res = await apiFetch('/api/auth/me/update/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                showToast('Profile updated successfully!');
                setPassword('');
                setConfirmPassword('');
            } else {
                const err = await res.json();
                showToast(err.error || 'Failed to update profile');
            }
        } catch {
            showToast('Network error while updating profile');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="up-root"><div className="up-container" style={{ textAlign: 'center', color: '#64748b' }}>Loading profile...</div></div>;

    return (
        <div className="up-root">
            <style>{UP_STYLES}</style>

            <div className="up-container">
                <div className="up-header">
                    <h1>Profile Settings</h1>
                    <p>Manage your account details and security</p>
                </div>

                <div className="up-card">
                    <form onSubmit={handleSave}>
                        <div className="up-field-group">
                            <div className="up-form-field">
                                <label>Username</label>
                                <input
                                    type="text"
                                    name="username"
                                    value={userData.username}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                            <div className="up-form-field">
                                <label>Email Address</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={userData.email}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                        </div>

                        <hr className="up-divider" />

                        <div className="up-section-title">Change Password</div>

                        <div className="up-field-group">
                            <div className="up-form-field">
                                <label>New Password (Optional)</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Leave blank to keep current password"
                                />
                            </div>
                            <div className="up-form-field">
                                <label>Confirm New Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm new password"
                                />
                            </div>
                        </div>

                        <button type="submit" className="up-btn-primary" disabled={saving}>
                            {saving ? 'Saving Changes...' : 'Save Profile Details'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
