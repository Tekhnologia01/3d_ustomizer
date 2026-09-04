import React, { useEffect, useMemo, useState } from 'react';
import type { Client } from '../types';
import { apiFetch } from '../utils/apiConfig';

interface Props {
  onBack: () => void;
  showToast: (msg: string) => void;
}

type ClientFormState = {
  id: number | null;
  name: string;
  slug: string;
  primary_color: string;
  is_active: boolean;
};

type SortKey = 'name_asc' | 'name_desc' | 'status';
const PAGE_SIZES = [25, 50, 100];

const emptyForm = (): ClientFormState => ({
  id: null,
  name: '',
  slug: '',
  primary_color: '#0D6E63',
  is_active: true,
});

export default function ClientManager({ onBack, showToast }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ClientFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [searchQ, setSearchQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name_asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    apiFetch('/api/clients/')
      .then(res => res.json())
      .then(data => { setClients(data || []); setLoading(false); })
      .catch(err => { console.error(err); showToast('Failed to fetch clients.'); setLoading(false); });
  }, [showToast]);

  const openCreate = () => {
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (client: Client) => {
    setForm({
      id: client.id,
      name: client.name,
      slug: client.slug,
      primary_color: client.primary_color ?? '#0D6E63',
      is_active: client.is_active ?? true,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setForm(emptyForm());
    setShowForm(false);
  };

  const saveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Client name is required.'); return; }
    if (!form.slug.trim()) { showToast('Client slug is required.'); return; }

    setSaving(true);
    const url = form.id ? `/api/clients/${form.id}/update/` : '/api/clients/create/';
    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('slug', form.slug.trim());
    fd.append('primary_color', form.primary_color);
    fd.append('is_active', form.is_active ? 'true' : 'false');

    try {
      const res = await apiFetch(url, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Client save failed.');
        return;
      }
      if (form.id) {
        setClients(clients.map(c => c.id === form.id ? data : c));
        showToast('Client updated.');
      } else {
        setClients([...clients, data]);
        showToast('Client created.');
      }
      resetForm();
    } catch (err) {
      console.error(err);
      showToast('Network error while saving client.');
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/clients/${id}/delete/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _method: 'DELETE' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Delete failed.');
        return;
      }
      setClients(clients.filter(c => c.id !== id));
      showToast('Client deleted.');
      setConfirmDeleteId(null);
    } catch (err) {
      console.error(err);
      showToast('Network error while deleting client.');
    } finally {
      setDeletingId(null);
    }
  };

  /* ── filter / sort / paginate ─────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = clients;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name_desc': return b.name.localeCompare(a.name);
        case 'status': return Number(b.is_active ?? true) - Number(a.is_active ?? true) || a.name.localeCompare(b.name);
        default: return a.name.localeCompare(b.name);
      }
    });
  }, [clients, searchQ, sortKey]);

  useEffect(() => { setPage(1); }, [searchQ, sortKey, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageClients = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="pm-root">
      <style>{CM_STYLES}</style>

      {/* ── Top bar ───────────────────────────── */}
      <header className="pm-topbar">
        <div className="pm-topbar-left">
          {/* <button className="pm-icon-btn" onClick={onBack} aria-label="Back to gallery">
            <ArrowLeftIcon />
          </button> */}
          <div className="pm-topbar-title">
            <h1>Clients</h1>
            <p>{clients.length.toLocaleString()} client{clients.length !== 1 ? 's' : ''} · shoppers, brands &amp; embed tenants</p>
          </div>
        </div>
        <div className="pm-topbar-right">
          <button className="pm-btn pm-btn-primary" onClick={openCreate}>
            <PlusIcon />
            Add client
          </button>
        </div>
      </header>

      <main className="pm-main">
        {/* Toolbar */}
        <div className="pm-main-header">
          <div className="pm-main-heading">
            <h2>All clients</h2>
            <span className="pm-main-count">{filtered.length.toLocaleString()} shown</span>
          </div>
          <div className="pm-main-controls">
            <div className="pm-search">
              <SearchIcon />
              <input
                placeholder="Search by name or slug…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
              />
              {searchQ && (
                <button className="pm-search-clear" onClick={() => setSearchQ('')} aria-label="Clear search">
                  <CloseIcon />
                </button>
              )}
            </div>
            <select className="pm-select" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="status">Active first</option>
            </select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="pm-modal-loading"><Spinner /> Loading clients…</div>
        ) : filtered.length === 0 ? (
          <div className="pm-empty">
            <div className="pm-empty-icon"><PeopleIcon /></div>
            <h3>No clients found</h3>
            <p>{searchQ ? 'Try a different search term.' : 'Add your first client to get started.'}</p>
            {!searchQ && (
              <button className="pm-btn pm-btn-primary" onClick={openCreate}>
                <PlusIcon />
                Add client
              </button>
            )}
          </div>
        ) : (
          <div className="pm-table-wrap pm-product-table-wrap">
            <table className="pm-table pm-product-table">
              <thead>
                <tr>
                  <th className="pm-th-thumb" />
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th className="pm-th-actions" />
                </tr>
              </thead>
              <tbody>
                {pageClients.map(client => (
                  <tr key={client.id}>
                    <td className="pm-th-thumb">
                      <span className="cm-swatch" style={{ background: client.primary_color || '#0D6E63' }} />
                    </td>
                    <td>
                      <div className="pm-row-name">{client.name}</div>
                    </td>
                    <td className="pm-table-mono pm-table-muted">{client.slug}</td>
                    <td>
                      <span className={`pm-tag ${client.is_active !== false ? 'pm-tag-accent' : 'pm-tag-muted'}`}>
                        {client.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="pm-th-actions">
                      <div className="pm-row-actions">
                        <button className="pm-icon-btn sm" title="Edit client" onClick={() => openEdit(client)}>
                          <EditIcon />
                        </button>
                        <button
                          className="pm-icon-btn sm danger"
                          title="Delete client"
                          onClick={() => setConfirmDeleteId(client.id)}
                          disabled={deletingId === client.id}
                        >
                          {deletingId === client.id ? <Spinner /> : <TrashIcon />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="pm-pagination">
            <div className="pm-pagination-size">
              <span>Rows per page</span>
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
                {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
            <div className="pm-pagination-info">
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length.toLocaleString()}
            </div>
            <div className="pm-pagination-nav">
              <button className="pm-icon-btn sm" disabled={safePage <= 1} onClick={() => setPage(1)} title="First page">
                <ChevronsLeftIcon />
              </button>
              <button className="pm-icon-btn sm" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)} title="Previous page">
                <ChevronLeftIcon />
              </button>
              <span className="pm-pagination-page">Page {safePage} of {totalPages}</span>
              <button className="pm-icon-btn sm" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)} title="Next page">
                <ChevronRightIcon />
              </button>
              <button className="pm-icon-btn sm" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)} title="Last page">
                <ChevronsRightIcon />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Delete Confirmation Modal ─────────────── */}
      {confirmDeleteId !== null && (
        <div className="pm-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="pm-dialog" onClick={e => e.stopPropagation()}>
            <div className="pm-dialog-icon danger"><TrashIcon /></div>
            <h2>Delete this client?</h2>
            <p>This removes the client and all of its product assignments. This can't be undone.</p>
            <div className="pm-dialog-actions">
              <button className="pm-btn pm-btn-ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button
                className="pm-btn pm-btn-danger"
                disabled={deletingId === confirmDeleteId}
                onClick={() => deleteClient(confirmDeleteId)}
              >
                {deletingId === confirmDeleteId ? 'Deleting…' : 'Delete client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Form Modal ──────────────── */}
      {showForm && (
        <div className="pm-overlay" onClick={resetForm}>
          <div className="pm-modal" onClick={e => e.stopPropagation()}>
            <div className="pm-modal-header">
              <h2>{form.id ? 'Edit client' : 'New client'}</h2>
              <button className="pm-icon-btn sm" onClick={resetForm} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={saveClient}>
              <div className="pm-modal-body">
                <div className="pm-field">
                  <label className="pm-label">Name</label>
                  <input
                    className="pm-input"
                    placeholder="e.g. Acme Corp"
                    value={form.name}
                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    required
                    autoFocus
                  />
                </div>
                <div className="pm-field">
                  <label className="pm-label">Slug</label>
                  <input
                    className="pm-input pm-input-mono"
                    value={form.slug}
                    onChange={e => setForm(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="client-slug"
                    required
                  />
                  <p className="pm-field-help">Used in embed URLs and product assignment.</p>
                </div>
                <div className="pm-field">
                  <label className="pm-label">Primary color</label>
                  <div className="cm-color-row">
                    <input
                      type="color"
                      className="cm-color-input"
                      value={form.primary_color}
                      onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))}
                    />
                    <input
                      className="pm-input pm-input-mono"
                      value={form.primary_color}
                      onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="pm-field">
                  <button
                    type="button"
                    className={`sp-switch cm-active-switch ${form.is_active ? 'on' : ''}`}
                    role="switch"
                    aria-checked={form.is_active}
                    onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                  >
                    <span className="sp-switch-knob" />
                  </button>
                  <span className="cm-active-label">{form.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              </div>

              <div className="pm-drawer-footer">
                <button type="button" className="pm-btn pm-btn-ghost" onClick={resetForm}>Cancel</button>
                <button type="submit" className="pm-btn pm-btn-primary" disabled={saving}>
                  {saving && <Spinner />}
                  {saving ? 'Saving…' : 'Save client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Icons — small inline SVGs, no external dependency
───────────────────────────────────────────────────────────── */
const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function ArrowLeftIcon() { return <svg {...iconProps}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>; }
function PlusIcon() { return <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>; }
function SearchIcon() { return <svg {...iconProps}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>; }
function CloseIcon() { return <svg {...iconProps}><path d="M18 6L6 18M6 6l12 12" /></svg>; }
function EditIcon() { return <svg {...iconProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>; }
function TrashIcon() { return <svg {...iconProps}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z" /></svg>; }
function PeopleIcon() { return <svg {...iconProps} width={28} height={28}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function ChevronLeftIcon() { return <svg {...iconProps}><path d="M15 18l-6-6 6-6" /></svg>; }
function ChevronRightIcon() { return <svg {...iconProps}><path d="M9 18l6-6-6-6" /></svg>; }
function ChevronsLeftIcon() { return <svg {...iconProps}><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>; }
function ChevronsRightIcon() { return <svg {...iconProps}><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>; }
function Spinner() { return <span className="pm-spinner" />; }

/* ─────────────────────────────────────────────────────────────
   Styles — shares the ProductManager / SetupPage design system
   (same tokens/atoms), plus a couple of client-specific bits
   prefixed "cm-".
───────────────────────────────────────────────────────────── */
const CM_STYLES = `
.pm-root {
  --pm-bg: #F7F8FA;
  --pm-surface: #FFFFFF;
  --pm-surface-alt: #F1F3F6;
  --pm-border: #E3E6EB;
  --pm-border-strong: #D0D5DD;
  --pm-text: #14181F;
  --pm-text-muted: #667085;
  --pm-text-faint: #98A2B3;
  --pm-accent: #0D6E63;
  --pm-accent-hover: #0A5850;
  --pm-accent-soft: #E6F4F1;
  --pm-danger: #D92D20;
  --pm-danger-soft: #FEF3F2;
  --pm-warn: #B54708;
  --pm-warn-soft: #FFFAEB;
  --pm-radius: 10px;
  --pm-radius-sm: 7px;
  --pm-font: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --pm-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;

  font-family: var(--pm-font);
  color: var(--pm-text);
  background: var(--pm-bg);
  height: 100%;
  min-height: 100vh;
  min-width: 90vw;
  padding: 0px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.pm-root * { box-sizing: border-box; }
.pm-root button { font-family: inherit; cursor: pointer; }
.pm-root input, .pm-root select, .pm-root textarea { font-family: inherit; }

/* Topbar */
.pm-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 28px; border-bottom: 1px solid var(--pm-border); background: var(--pm-surface); flex-shrink: 0; }
.pm-topbar-left { display: flex; align-items: center; gap: 14px; }
.pm-topbar-title h1 { font-size: 1.25rem; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
.pm-topbar-title p { font-size: 0.8125rem; color: var(--pm-text-muted); margin: 2px 0 0; }
.pm-topbar-right { display: flex; gap: 10px; }

/* Buttons */
.pm-btn { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px; border-radius: var(--pm-radius-sm); border: 1px solid transparent; font-size: 0.8125rem; font-weight: 550; text-decoration: none; transition: background .12s, border-color .12s, color .12s; white-space: nowrap; }
.pm-btn-primary { background: var(--pm-accent); color: #fff; }
.pm-btn-primary:hover { background: var(--pm-accent-hover); }
.pm-btn-primary:disabled { background: var(--pm-border-strong); cursor: not-allowed; }
.pm-btn-ghost { background: var(--pm-surface); color: var(--pm-text); border-color: var(--pm-border); }
.pm-btn-ghost:hover { background: var(--pm-surface-alt); border-color: var(--pm-border-strong); }
.pm-btn-danger { background: var(--pm-danger); color: #fff; }
.pm-btn-danger:hover { background: #B42318; }
.pm-btn-danger:disabled { background: #F0A9A2; cursor: not-allowed; }

.pm-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--pm-radius-sm); border: 1px solid var(--pm-border); background: var(--pm-surface); color: var(--pm-text-muted); transition: background .12s, color .12s, border-color .12s; flex-shrink: 0; }
.pm-icon-btn:hover { background: var(--pm-surface-alt); color: var(--pm-text); }
.pm-icon-btn.sm { width: 30px; height: 30px; }
.pm-icon-btn.danger:hover { background: var(--pm-danger-soft); color: var(--pm-danger); border-color: #FDA29B; }
.pm-icon-btn:disabled { opacity: .4; cursor: not-allowed; }

/* Main */
.pm-main { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 22px 28px 28px; overflow-y: auto; }
.pm-main-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.pm-main-heading { display: flex; align-items: baseline; gap: 10px; }
.pm-main-heading h2 { font-size: 1.0625rem; font-weight: 650; margin: 0; }
.pm-main-count { font-size: 0.8125rem; color: var(--pm-text-muted); }
.pm-main-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Search */
.pm-search { display: flex; align-items: center; gap: 9px; width: 280px; padding: 8px 12px; background: var(--pm-surface); border: 1px solid var(--pm-border); border-radius: var(--pm-radius-sm); color: var(--pm-text-faint); }
.pm-search:focus-within { border-color: var(--pm-accent); box-shadow: 0 0 0 3px var(--pm-accent-soft); color: var(--pm-text-muted); }
.pm-search input { flex: 1; border: none; outline: none; background: transparent; font-size: 0.8125rem; color: var(--pm-text); min-width: 0; }
.pm-search input::placeholder { color: var(--pm-text-faint); }
.pm-search-clear { display: flex; color: var(--pm-text-faint); border: none; background: none; padding: 2px; }
.pm-search-clear:hover { color: var(--pm-text); }
.pm-select { padding: 8px 10px; border: 1px solid var(--pm-border); border-radius: var(--pm-radius-sm); background: var(--pm-surface); font-size: 0.8125rem; color: var(--pm-text); outline: none; }
.pm-select:focus { border-color: var(--pm-accent); }

/* Table */
.pm-product-table-wrap { background: var(--pm-surface); border: 1px solid var(--pm-border); border-radius: var(--pm-radius); overflow: hidden; }
.pm-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
.pm-product-table thead th { background: var(--pm-surface-alt); }
.pm-table thead th { text-align: left; padding: 8px 10px; color: var(--pm-text-muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: .03em; border-bottom: 1px solid var(--pm-border); }
.pm-table tbody td { padding: 10px; border-bottom: 1px solid var(--pm-surface-alt); vertical-align: middle; }
.pm-table tbody tr:last-child td { border-bottom: none; }
.pm-table tbody tr:hover { background: var(--pm-surface-alt); }
.pm-th-thumb { width: 52px; }
.pm-th-actions { width: 100px; }
.pm-table-muted { color: var(--pm-text-faint); }
.pm-table-mono { font-family: var(--pm-mono); font-size: 0.75rem; }
.pm-row-name { font-weight: 600; }
.pm-row-actions { display: flex; gap: 5px; justify-content: flex-end; }
.cm-swatch { display: block; width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--pm-border-strong); }

/* Tags */
.pm-tag { font-size: 0.6875rem; font-weight: 550; padding: 2px 8px; border-radius: 20px; background: var(--pm-surface-alt); color: var(--pm-text-muted); }
.pm-tag-accent { background: var(--pm-accent-soft); color: var(--pm-accent-hover); }
.pm-tag-muted { background: var(--pm-warn-soft); color: var(--pm-warn); }

/* Pagination */
.pm-pagination { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--pm-border); }
.pm-pagination-size { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: var(--pm-text-muted); }
.pm-pagination-size select { padding: 5px 8px; border: 1px solid var(--pm-border); border-radius: 6px; background: var(--pm-surface); font-size: 0.75rem; }
.pm-pagination-info { font-size: 0.75rem; color: var(--pm-text-muted); }
.pm-pagination-nav { display: flex; align-items: center; gap: 4px; }
.pm-pagination-page { font-size: 0.75rem; color: var(--pm-text-muted); margin: 0 6px; white-space: nowrap; }

/* Empty state */
.pm-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 72px 20px; text-align: center; background: var(--pm-surface); border: 1px dashed var(--pm-border-strong); border-radius: var(--pm-radius); }
.pm-empty-icon { color: var(--pm-text-faint); margin-bottom: 4px; }
.pm-empty h3 { margin: 0; font-size: 0.9375rem; }
.pm-empty p { margin: 0 0 8px; font-size: 0.8125rem; color: var(--pm-text-muted); }
.pm-modal-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 60px 0; color: var(--pm-text-muted); font-size: 0.8125rem; }

/* Overlay / dialogs / modal */
.pm-overlay { position: fixed; inset: 0; background: rgba(16,24,40,0.45); backdrop-filter: blur(1px); display: flex; align-items: center; justify-content: center; z-index: 100; animation: pm-fade .12s ease-out; }
@keyframes pm-fade { from { opacity: 0; } to { opacity: 1; } }
.pm-dialog { width: 380px; max-width: 90vw; background: var(--pm-surface); border-radius: var(--pm-radius); padding: 24px; text-align: center; }
.pm-dialog-icon { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }
.pm-dialog-icon.danger { background: var(--pm-danger-soft); color: var(--pm-danger); }
.pm-dialog h2 { font-size: 1rem; margin: 0 0 6px; }
.pm-dialog p { font-size: 0.8125rem; color: var(--pm-text-muted); margin: 0 0 20px; line-height: 1.5; }
.pm-dialog-actions { display: flex; gap: 8px; justify-content: center; }
.pm-dialog-actions .pm-btn { flex: 1; justify-content: center; }

.pm-modal { width: 420px; max-width: 92vw; max-height: 85vh; background: var(--pm-surface); border-radius: var(--pm-radius); display: flex; flex-direction: column; overflow: hidden; }
.pm-modal-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--pm-border); }
.pm-modal-header h2 { font-size: 1rem; margin: 0; }
.pm-modal-body { padding: 20px; overflow-y: auto; }
.pm-drawer-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 16px 20px; border-top: 1px solid var(--pm-border); flex-shrink: 0; }
.pm-drawer-footer .pm-btn { min-width: 110px; justify-content: center; }

/* Fields */
.pm-field { margin-bottom: 18px; display: flex; flex-direction: column; }
.pm-field:last-child { margin-bottom: 0; }
.pm-label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--pm-text); margin-bottom: 6px; }
.pm-field-help { font-size: 0.75rem; color: var(--pm-text-muted); margin: 6px 0 0; line-height: 1.4; }
.pm-input { width: 100%; padding: 9px 11px; border: 1px solid var(--pm-border); border-radius: var(--pm-radius-sm); font-size: 0.8125rem; color: var(--pm-text); background: var(--pm-surface); outline: none; transition: border-color .12s, box-shadow .12s; }
.pm-input:focus { border-color: var(--pm-accent); box-shadow: 0 0 0 3px var(--pm-accent-soft); }
.pm-input-mono { font-family: var(--pm-mono); font-size: 0.75rem; }

/* Client-specific: color picker row + active switch */
.cm-color-row { display: flex; gap: 8px; align-items: center; }
.cm-color-input { width: 42px; height: 38px; padding: 2px; border: 1px solid var(--pm-border); border-radius: var(--pm-radius-sm); background: var(--pm-surface); cursor: pointer; flex-shrink: 0; }
.pm-field:has(.cm-active-switch) { flex-direction: row; align-items: center; gap: 10px; }
.cm-active-switch.sp-switch { position: relative; width: 36px; height: 21px; border-radius: 20px; background: var(--pm-border-strong); border: none; flex-shrink: 0; transition: background .15s; padding: 0; }
.cm-active-switch.sp-switch.on { background: var(--pm-accent); }
.sp-switch-knob { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(16,24,40,0.25); transition: transform .15s; }
.cm-active-switch.on .sp-switch-knob { transform: translateX(15px); }
.cm-active-label { font-size: 0.8125rem; font-weight: 600; color: var(--pm-text); }

/* Spinner */
.pm-spinner { display: inline-block; width: 13px; height: 13px; border: 2px solid rgba(0,0,0,0.15); border-top-color: currentColor; border-radius: 50%; animation: pm-spin .6s linear infinite; }
@keyframes pm-spin { to { transform: rotate(360deg); } }

/* Responsive */
@media (max-width: 640px) {
  .pm-topbar { padding: 16px; flex-wrap: wrap; }
  .pm-main { padding: 16px; }
  .pm-search { width: 100%; }
}
`;