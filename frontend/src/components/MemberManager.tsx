import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiConfig';

interface Member {
    id: number;
    username: string;
    email: string;
    is_superuser: boolean;
}

interface MemberManagerProps {
    onBack?: () => void;
    showToast: (msg: string) => void;
}

const MM_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

.mm-root {
    font-family: 'Inter', sans-serif;
    background: #f7f8fc;
    min-height: 100vh;
    padding: 0;
}

.mm-topbar {
    background: #ffffff;
    border-bottom: 1px solid #e8eaf0;
    padding: 0 2rem;
    height: 60px;
    display: flex;
    align-items: center;
    gap: 1rem;
    position: sticky;
    top: 0;
    z-index: 50;
}

.mm-topbar-back {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: #6b7280;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 8px;
    transition: all 0.15s;
    font-family: 'Inter', sans-serif;
}

.mm-topbar-back:hover {
    background: #f3f4f6;
    color: #111;
}

.mm-topbar-divider {
    width: 1px;
    height: 20px;
    background: #e5e7eb;
}

.mm-topbar-title {
    font-size: 0.92rem;
    font-weight: 600;
    color: #111827;
    letter-spacing: -0.01em;
}

.mm-body {
    max-width: 1000px;
    margin: 0 auto;
    padding: 2.25rem 2rem 2.75rem;
}

.mm-page-hero {
    margin-bottom: 2rem;
}

.mm-page-hero h1 {
    font-size: 1.8rem;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.04em;
    margin-bottom: 0.4rem;
}

.mm-page-hero p {
    color: #6b7280;
    font-size: 0.92rem;
    font-weight: 400;
    line-height: 1.6;
}

/* ── Invite Card ── */
.mm-invite-card {
    background: linear-gradient(135deg, #1a1040 0%, #0d1a40 100%);
    border-radius: 16px;
    padding: 1.75rem 2.5rem;
    margin-bottom: 1.5rem;
    position: relative;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(108,99,255,0.2);
}

.mm-invite-card::before {
    content: '';
    position: absolute;
    width: 300px; height: 300px;
    top: -100px; right: -50px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(108,99,255,0.25) 0%, transparent 70%);
    pointer-events: none;
}

.mm-invite-header {
    display: flex;
    align-items: start;
    gap: 16px;
    margin-bottom: 1.5rem;
}

.mm-invite-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(108, 99, 255, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    flex-shrink: 0;
}

.mm-invite-header-text h3 {
    font-size: 1.05rem;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: -0.02em;
    margin-bottom: 3px;
}

.mm-invite-header-text p {
    color: rgba(255,255,255,0.5);
    font-size: 0.83rem;
    font-weight: 400;
}

.mm-invite-form {
    display: flex;
    gap: 0.85rem;
    align-items: flex-end;
}

.mm-form-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.mm-form-field label {
    font-size: 0.72rem;
    font-weight: 600;
    color: rgba(255,255,255,0.45);
    text-transform: uppercase;
    letter-spacing: 0.09em;
}

.mm-form-field input {
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    padding: 0.8rem 1rem;
    color: #ffffff;
    font-size: 0.9rem;
    font-family: 'Inter', sans-serif;
    outline: none;
    transition: all 0.2s;
    box-sizing: border-box;
    width: 100%;
}

.mm-form-field input::placeholder {
    color: rgba(255,255,255,0.22);
}

.mm-form-field input:focus {
    border-color: rgba(108, 99, 255, 0.7);
    background: rgba(108, 99, 255, 0.1);
    box-shadow: 0 0 0 3px rgba(108, 99, 255, 0.15);
}

.mm-invite-btn {
    padding: 0.8rem 1.6rem;
    background: linear-gradient(135deg, #6c63ff, #4a3fdb);
    border: none;
    border-radius: 10px;
    color: #ffffff;
    font-size: 0.88rem;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    box-shadow: 0 4px 16px rgba(108, 99, 255, 0.4);
    height: 40px;
    box-sizing: border-box;
}

.mm-invite-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(108, 99, 255, 0.5);
}

.mm-invite-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
}

.mm-btn-spinner {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: mm-spin 0.7s linear infinite;
}

@keyframes mm-spin { to { transform: rotate(360deg); } }

/* ── Members Table Card ── */
.mm-table-card {
    background: #ffffff;
    border-radius: 16px;
    border: 1px solid #e8eaf0;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}

.mm-table-header {
    padding: 1.25rem 1.75rem;
    border-bottom: 1px solid #f1f3f7;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.mm-table-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.02em;
}

.mm-member-count {
    font-size: 0.78rem;
    background: #f3f4f6;
    color: #6b7280;
    padding: 3px 10px;
    border-radius: 20px;
    font-weight: 600;
}

.mm-table {
    width: 100%;
    border-collapse: collapse;
}

.mm-table thead tr {
    background: #f8f9fc;
}

.mm-table thead th {
    text-align: left;
    padding: 0.75rem 1.75rem;
    font-size: 0.72rem;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    border-bottom: 1px solid #f1f3f7;
}

.mm-table tbody td {
    padding: 1.1rem 1.75rem;
    border-bottom: 1px solid #f1f3f7;
    font-size: 0.88rem;
    color: #374151;
    vertical-align: middle;
}

.mm-table tbody tr:last-child td {
    border-bottom: none;
}

.mm-table tbody tr:hover td {
    background: #f9fafb;
}

.mm-user-cell {
    display: flex;
    align-items: center;
    gap: 12px;
}

.mm-avatar {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, #6c63ff, #3a7bff);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    font-weight: 700;
    color: #ffffff;
    flex-shrink: 0;
    text-transform: uppercase;
}

.mm-user-name {
    font-weight: 600;
    color: #0f172a;
    font-size: 0.88rem;
}

.mm-role-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
}

.mm-role-badge.superadmin {
    background: rgba(108,99,255,0.1);
    color: #6c63ff;
    border: 1px solid rgba(108,99,255,0.2);
}

.mm-role-badge.staff {
    background: rgba(20,168,0,0.08);
    color: #14a800;
    border: 1px solid rgba(20,168,0,0.2);
}

.mm-remove-btn {
    padding: 6px 14px;
    background: transparent;
    border: 1px solid #fee2e2;
    border-radius: 8px;
    color: #dc2626;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    transition: all 0.15s;
}

.mm-remove-btn:hover {
    background: #fef2f2;
    border-color: #dc2626;
}

.mm-empty-state {
    padding: 4rem 2rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
}

.mm-empty-icon {
    font-size: 2.5rem;
    opacity: 0.3;
}

.mm-empty-state p {
    color: #9ca3af;
    font-size: 0.9rem;
    font-weight: 500;
}

.mm-empty-state span {
    color: #c4c9d4;
    font-size: 0.82rem;
}

.mm-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 3rem;
    color: #9ca3af;
    font-size: 0.88rem;
}

.mm-loading-dot {
    width: 8px; height: 8px;
    background: #6c63ff;
    border-radius: 50%;
    animation: mm-pulse 1.2s ease-in-out infinite;
}
.mm-loading-dot:nth-child(2) { animation-delay: 0.2s; }
.mm-loading-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes mm-pulse {
    0%, 100% { opacity: 0.3; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
}

.mm-info-strip {
    display: block;
    align-items: center;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 10px;
    padding: 0.85rem 1.1rem;
    margin-top: 1.25rem;
    font-size: 0.83rem;
    color: #92400e;
    font-weight: 500;
}

.mm-info-strip > span:first-child {
    margin-right: 10px;
}

@media (max-width: 720px) {
    .mm-body { padding: 1.5rem 1rem 2rem; }
    .mm-topbar { padding: 0 1rem; }
    .mm-invite-card { padding: 1.5rem; }
    .mm-invite-form { flex-direction: column; align-items: stretch; }
    .mm-form-field[style] { flex: 1 !important; }
    .mm-invite-btn { justify-content: center; width: 100%; }
    .mm-table-card { overflow-x: auto; }
    .mm-table { min-width: 620px; }
}
`;

export default function MemberManager({ onBack, showToast }: MemberManagerProps) {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [confirmDeleteMember, setConfirmDeleteMember] = useState<{ id: number, username: string } | null>(null);
    const [currentUser, setCurrentUser] = useState<{ is_superuser: boolean } | null>(null);

    useEffect(() => {
        fetchCurrentUser();
        fetchMembers();
    }, []);

    const fetchCurrentUser = async () => {
        try {
            const res = await apiFetch('/api/auth/me/');
            if (res.ok) {
                const data = await res.json();
                setCurrentUser(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchMembers = async () => {
        try {
            const res = await apiFetch('/api/members/');
            if (res.ok) {
                const data = await res.json();
                setMembers(data);
            }
        } catch (err) {
            showToast('Failed to load members');
        } finally {
            setLoading(false);
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsAdding(true);
        try {
            const res = await apiFetch('/api/members/add/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: newUsername, email: newEmail })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.email_sent
                    ? `✓ Invitation sent to ${newEmail}`
                    : `✓ Member added (email not sent — check email config)`);
                setNewUsername('');
                setNewEmail('');
                fetchMembers();
            } else {
                showToast(data.error || 'Failed to add member');
            }
        } catch {
            showToast('Network error.');
        } finally {
            setIsAdding(false);
        }
    };

    const executeDeleteMember = async () => {
        if (!confirmDeleteMember) return;
        const { id, username } = confirmDeleteMember;
        try {
            const res = await apiFetch(`/api/members/${id}/delete/`, { method: 'DELETE' });
            if (res.ok) {
                showToast(`${username} removed successfully.`);
                setMembers(prev => prev.filter(m => m.id !== id));
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to remove member');
            }
        } catch {
            showToast('Network error.');
        } finally {
            setConfirmDeleteMember(null);
        }
    };

    return (
        <div className="mm-root">
            <style>{MM_STYLES}</style>

            {/* Top bar */}
            <header className="mm-topbar">
                {onBack && (
                    <button className="mm-topbar-back" onClick={onBack}>
                        ← Back
                    </button>
                )}
                <div className="mm-topbar-divider" />
                <span className="mm-topbar-title">Member Management</span>
            </header>

            <div className="mm-body">
                {/* Page hero */}
                <div className="mm-page-hero">
                    <h1>Staff Members</h1>
                    <p>Invite team members and manage who has access to this dashboard. Credentials are emailed automatically.</p>
                </div>

                {/* Invite card */}
                <div className="mm-invite-card">
                    <div className="mm-invite-card::before" />
                    <div className="mm-invite-header">
                        <div className="mm-invite-icon">✉</div>
                        <div className="mm-invite-header-text">
                            <h3>Invite a New Member</h3>
                            <p>A secure password is auto-generated and emailed directly to them.</p>
                        </div>
                    </div>

                    <form onSubmit={handleAddMember} className="mm-invite-form">
                        <div className="mm-form-field">
                            <label>Username</label>
                            <input
                                type="text"
                                value={newUsername}
                                onChange={e => setNewUsername(e.target.value)}
                                placeholder="e.g. john_doe"
                                required
                            />
                        </div>
                        <div className="mm-form-field" style={{ flex: 1.6 }}>
                            <label>Email Address</label>
                            <input
                                type="email"
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                                placeholder="john@yourcompany.com"
                                required
                            />
                        </div>
                        <button type="submit" className="mm-invite-btn" disabled={isAdding}>
                            {isAdding ? (
                                <><span className="mm-btn-spinner" /> Sending...</>
                            ) : (
                                <>Send Invite</>
                            )}
                        </button>
                    </form>

                </div>

                {/* Members table */}
                <div className="mm-table-card">
                    <div className="mm-table-header">
                        <span className="mm-table-title">Current Staff</span>
                        <span className="mm-member-count">
                            {loading ? '...' : `${members.length} member${members.length !== 1 ? 's' : ''}`}
                        </span>
                    </div>

                    {loading ? (
                        <div className="mm-loading">
                            <div className="mm-loading-dot" />
                            <div className="mm-loading-dot" />
                            <div className="mm-loading-dot" />
                            Loading members...
                        </div>
                    ) : members.length === 0 ? (
                        <div className="mm-empty-state">
                            <div className="mm-empty-icon">👥</div>
                            <p>No staff members yet</p>
                            <span>Use the invite form above to add your first team member.</span>
                        </div>
                    ) : (
                        <table className="mm-table">
                            <thead>
                                <tr>
                                    <th>Member</th>
                                    <th>Email Address</th>
                                    <th>Role</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {members.map(member => (
                                    <tr key={member.id}>
                                        <td>
                                            <div className="mm-user-cell">
                                                <div className="mm-avatar">
                                                    {member.username.charAt(0)}
                                                </div>
                                                <span className="mm-user-name">{member.username}</span>
                                            </div>
                                        </td>
                                        <td style={{ color: '#6b7280' }}>{member.email}</td>
                                        <td>
                                            <span className={`mm-role-badge ${member.is_superuser ? 'superadmin' : 'staff'}`}>
                                                {member.is_superuser ? '👑 Super Admin' : '🛡 Staff'}
                                            </span>
                                        </td>
                                        <td>
                                            {(!member.is_superuser || currentUser?.is_superuser) ? (
                                                <button
                                                    className="mm-remove-btn"
                                                    onClick={() => setConfirmDeleteMember({ id: member.id, username: member.username })}
                                                >
                                                    Remove Access
                                                </button>
                                            ) : (
                                                <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', fontWeight: 600 }}>Protected Account</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Delete Member Confirmation Modal */}
            {confirmDeleteMember && (
                <div className="pm-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirmDeleteMember(null)}>
                    <div className="pm-confirm" style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} onClick={e => e.stopPropagation()}>
                        <div className="pm-confirm-icon" style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', marginBottom: '16px' }}>⚠️</div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#111827', marginBottom: '8px', fontFamily: 'Inter, sans-serif' }}>Remove Member Access</h2>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5, marginBottom: '24px', fontFamily: 'Inter, sans-serif' }}>
                            Are you sure you want to remove <strong>{confirmDeleteMember.username}</strong>'s access? They will no longer be able to log into this dashboard. This action cannot be undone.
                        </p>
                        <div className="pm-confirm-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer', fontWeight: 500, color: '#64748b', fontFamily: 'Inter, sans-serif' }} onClick={() => setConfirmDeleteMember(null)}>Cancel</button>
                            <button style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontWeight: 500, fontFamily: 'Inter, sans-serif' }} onClick={executeDeleteMember}>Remove Access</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
