import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { Product } from '../types';
import { resolveImageUrl } from '../utils/productImages';
import { generateProduct3D, pollTripoTask, completeTripoGeneration, getTripoTaskStatus } from '../utils/tripoApi';
import { apiFetch } from '../utils/apiConfig';

interface ProductManagerProps {
  products: Product[];
  onBack: () => void;
  showToast: (msg: string) => void;
  onProductsChange: (updated: Product[]) => void;
}

type Side = 'front' | 'back' | 'left' | 'right' | 'top';
const SIDES: Side[] = ['front', 'back', 'left', 'right', 'top'];
const SIDE_LABELS: Record<Side, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
};
const SIDE_API_FIELDS: Record<Side, string> = {
  front: 'image',
  back: 'back_image',
  left: 'left_image',
  right: 'right_image',
  top: 'top_image',
};
const SIDE_URL_FIELDS: Record<Side, string> = {
  front: 'image_url',
  back: 'back_image_url',
  left: 'left_image_url',
  right: 'right_image_url',
  top: 'top_image_url',
};

type SortKey = 'name_asc' | 'name_desc' | 'images_most' | 'images_least';
type ViewMode = 'table' | 'grid';
const PAGE_SIZES = [25, 50, 100, 200];

interface FormState {
  name: string;
  shape_type: string;
  client_slug?: string;
  external_product_url?: string;
  external_product_id?: string;
  tripo_job_id?: string;
  tripo_model_url?: string;
  tripo_status?: string;
  imageUrls: Partial<Record<Side, string>>;
  images: Partial<Record<Side, File | null>>;
  imagePreviews: Partial<Record<Side, string>>;
  model3d: File | null;
  model3dName: string;
}

const emptyForm = (): FormState => ({
  name: '',
  shape_type: 'flat',
  client_slug: undefined,
  external_product_url: '',
  external_product_id: '',
  tripo_job_id: '',
  tripo_model_url: '',
  tripo_status: '',
  imageUrls: {},
  images: {},
  imagePreviews: {},
  model3d: null,
  model3dName: '',
});

const GLOBAL_KEY = '__global__';
const ALL_KEY = '__all__';

/* ─────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────── */
export default function ProductManager({ products, onBack, showToast, onProductsChange }: ProductManagerProps) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [clients, setClients] = useState<{ id: number; name: string; slug: string }[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Tripo 3D generation state - supports concurrent generations
  const [activeGenerations, setActiveGenerations] = useState<Map<number, { progress: number; status: string }>>(new Map());
  const [regenerateConfirmProduct, setRegenerateConfirmProduct] = useState<Product | null>(null);

  // Texture quality selection for each product (default: standard)
  const [textureQualitySelection, setTextureQualitySelection] = useState<Map<number, 'standard' | 'detailed' | 'extreme'>>(new Map());

  // Navigation / scale controls
  const [selectedClientKey, setSelectedClientKey] = useState<string>(ALL_KEY);
  const [clientNavSearch, setClientNavSearch] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name_asc');
  const [view, setView] = useState<ViewMode>('table');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Submissions Modal State
  type Submission = {
    id: number;
    product_name: string;
    client: string | null;
    color_name: string | null;
    color_hex: string | null;
    imprint_method: string | null;
    quantity: number;
    created_at: string;
    has_pdf: boolean;
    has_preview: boolean;
  };
  const [submissionsProduct, setSubmissionsProduct] = useState<Product | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  const fileInputRefs = useRef<Partial<Record<Side, HTMLInputElement | null>>>({});
  const model3dRef = useRef<HTMLInputElement | null>(null);

  /* ── helpers ───────────────────────────────────────────── */
  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    // Pre-fill the client if the user is currently browsing one — saves a step.
    if (selectedClientKey !== ALL_KEY && selectedClientKey !== GLOBAL_KEY) {
      setForm(prev => ({ ...prev, client_slug: selectedClientKey }));
    }
    setShowForm(true);
  };

  useEffect(() => {
    apiFetch('/api/clients/')
      .then((res) => res.json())
      .then((data) => setClients(data || []))
      .catch((err) => {
        console.error('Failed to load clients:', err);
      });
  }, []);

  // Auto-recover interrupted Tripo tasks on component load
  useEffect(() => {
    const recoverInterruptedTasks = async () => {
      const productsWithPendingTasks = products.filter(
        p => p.tripo_job_id && p.tripo_status === 'pending' && !activeGenerations.has(p.id)
      );

      if (productsWithPendingTasks.length > 0) {
        console.log(`Found ${productsWithPendingTasks.length} interrupted tasks, recovering...`);

        for (const product of productsWithPendingTasks) {
          try {
            // Don't await - let them recover in parallel
            handleRecoverTripoTask(product);
          } catch (error) {
            console.error(`Failed to recover task for product ${product.id}:`, error);
          }
        }
      }
    };

    // Small delay to ensure component is fully mounted
    const timer = setTimeout(recoverInterruptedTasks, 1000);
    return () => clearTimeout(timer);
  }, [products]);

  const openSubmissions = async (p: Product) => {
    setSubmissionsProduct(p);
    setSubmissions([]);
    setSubmissionsLoading(true);
    try {
      const res = await apiFetch(`/api/products/${p.id}/submissions/`);
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      showToast('Failed to load submissions.');
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const openEditForm = (p: Product) => {
    setForm({
      name: p.name,
      shape_type: p.shape_type || 'flat',
      client_slug: p.client_slug ?? undefined,
      external_product_url: p.external_product_url ?? '',
      external_product_id: p.external_product_id ?? '',
      tripo_job_id: p.tripo_job_id ?? '',
      tripo_model_url: p.tripo_model_url ?? '',
      tripo_status: p.tripo_status ?? '',
      imageUrls: {
        front: p.image_url && !p.image_url.startsWith('/media/') ? p.image_url : '',
        back: p.back_image_url && !p.back_image_url.startsWith('/media/') ? p.back_image_url : '',
        left: p.left_image_url && !p.left_image_url.startsWith('/media/') ? p.left_image_url : '',
        right: p.right_image_url && !p.right_image_url.startsWith('/media/') ? p.right_image_url : '',
        top: p.top_image_url && !p.top_image_url.startsWith('/media/') ? p.top_image_url : '',
      },
      images: {},
      imagePreviews: {
        front: resolveImageUrl(p.image_url),
        back: resolveImageUrl(p.back_image_url),
        left: resolveImageUrl(p.left_image_url),
        right: resolveImageUrl(p.right_image_url),
        top: resolveImageUrl(p.top_image_url),
      },
      model3d: null,
      model3dName: (p.model_3d_url || p.tripo_model_url) ? (p.model_3d_url || p.tripo_model_url)!.split('/').pop() || '' : '',
    });
    setEditingId(p.id);
    setShowForm(true);

    // Show a hint if the image appears to be scraped from external URL
    if (p.image_url && p.external_product_url && p.image_url !== p.external_product_url) {
      showToast('Image was automatically scraped from the storefront URL.');
    }
  };

  const handleImageChange = useCallback((side: Side, file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setForm(prev => ({
      ...prev,
      images: { ...prev.images, [side]: file },
      imageUrls: { ...prev.imageUrls, [side]: '' },
      imagePreviews: { ...prev.imagePreviews, [side]: url },
    }));
  }, []);

  const handleImageUrlChange = (side: Side, url: string) => {
    setForm(prev => ({
      ...prev,
      imageUrls: { ...prev.imageUrls, [side]: url },
      images: { ...prev.images, [side]: null },
      imagePreviews: { ...prev.imagePreviews, [side]: url },
    }));
  };

  const clearImage = (side: Side) => {
    setForm(prev => ({
      ...prev,
      images: { ...prev.images, [side]: null },
      imageUrls: { ...prev.imageUrls, [side]: '' },
      imagePreviews: { ...prev.imagePreviews, [side]: '' },
    }));
    const input = fileInputRefs.current[side];
    if (input) input.value = '';
  };

  const handleModel3dChange = (file: File | null) => {
    setForm(prev => ({
      ...prev,
      model3d: file,
      model3dName: file ? file.name : '',
    }));
  };

  /* ── submit ─────────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Product name is required.'); return; }
    setSaving(true);

    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('shape_type', form.shape_type);
    if (form.client_slug) fd.append('client_slug', form.client_slug);
    if (form.external_product_url) fd.append('external_product_url', form.external_product_url.trim());
    if (form.external_product_id) fd.append('external_product_id', form.external_product_id.trim());
    if (form.tripo_job_id) fd.append('tripo_job_id', form.tripo_job_id.trim());
    if (form.tripo_model_url) fd.append('tripo_model_url', form.tripo_model_url.trim());
    if (form.tripo_status) fd.append('tripo_status', form.tripo_status.trim());

    for (const side of SIDES) {
      const imageUrl = form.imageUrls[side]?.trim();
      const file = form.images[side];
      if (imageUrl) {
        fd.append(SIDE_URL_FIELDS[side], imageUrl);
      } else if (file) {
        fd.append(SIDE_API_FIELDS[side], file);
      } else if (editingId) {
        // Signal backend to clear this side's image when editing
        fd.append(`clear_${side}_image`, '1');
      }
    }
    if (form.model3d) fd.append('model_3d', form.model3d);

    try {
      const url = editingId
        ? `/api/products/${editingId}/update/`
        : `/api/products/create/`;
      const res = await apiFetch(url, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Save failed.');
        return;
      }
      const updated: Product = {
        id: data.id,
        name: data.name,
        shape_type: data.shape_type,
        client_slug: data.client_slug || null,
        external_product_url: data.external_product_url || null,
        external_product_id: data.external_product_id || null,
        tripo_job_id: data.tripo_job_id || null,
        tripo_model_url: data.tripo_model_url || null,
        tripo_status: data.tripo_status || null,
        image_url: data.image_url || '',
        back_image_url: data.back_image_url || '',
        left_image_url: data.left_image_url || '',
        right_image_url: data.right_image_url || '',
        top_image_url: data.top_image_url || '',
        model_3d_url: data.model_3d_url || null,
      };
      if (editingId) {
        onProductsChange(products.map(p => p.id === editingId ? updated : p));
        if (data.image_scraped) {
          showToast('Product updated. Image automatically scraped from URL.');
        } else {
          showToast('Product updated.');
        }
      } else {
        onProductsChange([...products, updated]);
        if (data.image_scraped) {
          showToast('Product created. Image automatically scraped from URL.');
        } else {
          showToast('Product created.');
        }
      }
      resetForm();
    } catch (err) {
      showToast('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  /* ── delete ─────────────────────────────────────────────── */
  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      const res = await apiFetch(`/api/products/${id}/delete/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _method: 'DELETE' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Delete failed.');
        return;
      }
      onProductsChange(products.filter(p => p.id !== id));
      showToast('Product deleted.');
      setConfirmDelete(null);
    } catch {
      showToast('Network error. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  /* ── reset tripo status ───────────────────────────────────── */
  const handleResetTripoStatus = async (id: number) => {
    try {
      const res = await apiFetch(`/api/products/${id}/reset-tripo-status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to reset status.');
        return;
      }
      onProductsChange(products.map(p => p.id === id ? { ...p, tripo_status: '' } : p));
      showToast('Tripo status reset successfully.');
    } catch {
      showToast('Network error. Please try again.');
    }
  };

  /* ── check tripo task status manually ─────────────────────── */
  const handleCheckTripoStatus = async (productId: number) => {
    const product = products.find(p => p.id === productId);
    if (!product || !product.tripo_job_id) {
      showToast('No Tripo job ID found for this product.');
      return;
    }

    try {
      showToast(`Checking status for task: ${product.tripo_job_id}...`);
      const res = await apiFetch(`/api/tripo/task-status/${product.tripo_job_id}/`);
      const data = await res.json();

      if (!res.ok) {
        showToast(`Status check failed: ${data.error || 'Unknown error'}`);
        return;
      }

      const statusMessage = `Status: ${data.status}, Progress: ${data.progress}%`;
      showToast(statusMessage);

      console.log('Tripo Task Status:', data);

      // If task succeeded, try to complete it
      if (data.status === 'success' && data.model_url) {
        showToast('Task completed! Downloading model...');
        try {
          const completeResponse = await completeTripoGeneration(product.tripo_job_id, productId);

          const updatedProduct = {
            ...product,
            model_3d_url: completeResponse.model_url,
            tripo_status: 'success',
          };
          onProductsChange(products.map(p => p.id === productId ? updatedProduct : p));
          showToast('3D model downloaded and stored successfully!');
        } catch (error) {
          console.error('Error completing generation:', error);
          showToast('Failed to download model. See console for details.');
        }
      } else if (data.status === 'failed' || data.status === 'cancelled' || data.status === 'banned') {
        showToast(`Task ${data.status}. Please try again.`);
        // Update status to failed
        const updatedProduct = { ...product, tripo_status: 'failed' };
        onProductsChange(products.map(p => p.id === productId ? updatedProduct : p));
      }
    } catch (error) {
      console.error('Error checking Tripo status:', error);
      showToast('Failed to check Tripo status. See console for details.');
    }
  };

  /* ── Tripo 3D generation ──────────────────────────────────── */
  const requestGenerate3D = (product: Product) => {
    if (!product.image_url && !product.external_product_url) {
      showToast('Product needs an image to generate 3D model.');
      return;
    }
    if (activeGenerations.has(product.id)) {
      showToast('3D generation already in progress for this product.');
      return;
    }
    // If a 3D model already exists, show the regeneration warning modal
    if (product.model_3d_url) {
      setRegenerateConfirmProduct(product);
      return;
    }
    handleGenerate3D(product);
  };

  const handleGenerate3D = async (product: Product) => {
    // Get selected texture quality
    const textureQuality = getTextureQuality(product.id);
    const qualityInfo = getTextureQualityInfo(textureQuality);

    // Start generation - non-blocking
    setActiveGenerations(prev => new Map(prev).set(product.id, { progress: 0, status: 'Starting...' }));

    try {
      // Start the generation with selected texture quality
      const response = await generateProduct3D(product.id, textureQuality);
      const taskId = response.task_id;

      // Update product with task ID immediately for recovery
      const updatedProductWithTask = {
        ...product,
        tripo_job_id: taskId,
        tripo_status: 'pending',
      };
      onProductsChange(products.map(p => p.id === product.id ? updatedProductWithTask : p));

      // Poll for completion with progress updates
      const result = await pollTripoTask(
        taskId,
        (progress, status) => {
          setActiveGenerations(prev => {
            const newMap = new Map(prev);
            const current = newMap.get(product.id);
            if (current) {
              newMap.set(product.id, { progress, status });
            }
            return newMap;
          });
        },
        2000, // poll every 2 seconds
        600000 // 10 minute timeout (increased for longer generations)
      );

      // Complete the generation by downloading and storing the model
      setActiveGenerations(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(product.id);
        if (current) {
          newMap.set(product.id, { progress: current.progress, status: 'Downloading model...' });
        }
        return newMap;
      });

      const completeResponse = await completeTripoGeneration(taskId, product.id);

      // Update the product in the list with model URL and preview
      const updatedProduct = {
        ...product,
        model_3d_url: completeResponse.model_url,
        image_url: completeResponse.preview_url || product.image_url, // Update with preview if available
        tripo_status: 'success',
      };
      onProductsChange(products.map(p => p.id === product.id ? updatedProduct : p));

      showToast(`3D model generated for "${product.name}" successfully!`);

      // Remove from active generations
      setActiveGenerations(prev => {
        const newMap = new Map(prev);
        newMap.delete(product.id);
        return newMap;
      });
    } catch (error) {
      console.error('3D generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Provide more helpful error messages for common issues
      if (errorMessage.includes('og:image') || errorMessage.includes('product image')) {
        // Try to parse any debug information if available
        let detailedMessage = 'Could not find product image from URL. Please upload an image directly or use a URL with proper meta tags.';

        // Check if error response has debug info
        if (error instanceof Error && 'cause' in error) {
          try {
            const errorData = JSON.parse((error as any).cause?.message || '{}');
            if (errorData.debug_info) {
              console.log('Debug info:', errorData.debug_info);
              if (errorData.debug_info.total_images_found > 0) {
                detailedMessage = `Found ${errorData.debug_info.total_images_found} images on the page but couldn't identify the main product image. Please upload the image directly.`;
              }
            }
          } catch (e) {
            // If parsing fails, use the default message
          }
        }

        showToast(`"${product.name}": ${detailedMessage}`);
      } else if (errorMessage.includes('API key') || errorMessage.includes('configured')) {
        showToast('3D generation service not configured. Please check API settings.');
      } else if (errorMessage.includes('timed out')) {
        showToast(`"${product.name}": Generation timed out. The task may still complete - try checking status manually.`);
      } else {
        showToast(`"${product.name}": 3D generation failed - ${errorMessage}`);
      }

      // Update status to failed and remove after a delay
      setActiveGenerations(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(product.id);
        if (current) {
          newMap.set(product.id, { progress: current.progress, status: 'Failed' });
        }
        return newMap;
      });

      // Remove from active generations after 3 seconds
      setTimeout(() => {
        setActiveGenerations(prev => {
          const newMap = new Map(prev);
          newMap.delete(product.id);
          return newMap;
        });
      }, 3000);

      // Update product status to failed
      const updatedProduct = {
        ...product,
        tripo_status: 'failed',
      };
      onProductsChange(products.map(p => p.id === product.id ? updatedProduct : p));
    }
  };

  /* ── Recover interrupted Tripo tasks ────────────────────────── */
  const handleRecoverTripoTask = async (product: Product) => {
    if (!product.tripo_job_id) {
      showToast('No Tripo job ID found for this product.');
      return;
    }

    // Check if already generating
    if (activeGenerations.has(product.id)) {
      showToast('3D generation already in progress for this product.');
      return;
    }

    setActiveGenerations(prev => new Map(prev).set(product.id, { progress: 0, status: 'Recovering task...' }));

    try {
      // Check current status
      const statusResponse = await getTripoTaskStatus(product.tripo_job_id);

      if (statusResponse.status === 'success') {
        // Task already completed, download the model
        setActiveGenerations(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(product.id);
          if (current) {
            newMap.set(product.id, { progress: 100, status: 'Downloading model...' });
          }
          return newMap;
        });

        const completeResponse = await completeTripoGeneration(product.tripo_job_id, product.id);

        const updatedProduct = {
          ...product,
          model_3d_url: completeResponse.model_url,
          image_url: completeResponse.preview_url || product.image_url,
          tripo_status: 'success',
        };
        onProductsChange(products.map(p => p.id === product.id ? updatedProduct : p));

        showToast(`Recovered 3D model for "${product.name}" successfully!`);
      } else if (statusResponse.status === 'failed' || statusResponse.status === 'cancelled' || statusResponse.status === 'banned') {
        showToast(`Task ${statusResponse.status}. Please try generating again.`);
        const updatedProduct = { ...product, tripo_status: 'failed' };
        onProductsChange(products.map(p => p.id === product.id ? updatedProduct : p));
      } else {
        // Task still in progress, start polling
        const result = await pollTripoTask(
          product.tripo_job_id,
          (progress, status) => {
            setActiveGenerations(prev => {
              const newMap = new Map(prev);
              const current = newMap.get(product.id);
              if (current) {
                newMap.set(product.id, { progress, status });
              }
              return newMap;
            });
          },
          2000,
          600000
        );

        // Complete the generation
        setActiveGenerations(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(product.id);
          if (current) {
            newMap.set(product.id, { progress: current.progress, status: 'Downloading model...' });
          }
          return newMap;
        });

        const completeResponse = await completeTripoGeneration(product.tripo_job_id, product.id);

        const updatedProduct = {
          ...product,
          model_3d_url: completeResponse.model_url,
          image_url: completeResponse.preview_url || product.image_url,
          tripo_status: 'success',
        };
        onProductsChange(products.map(p => p.id === product.id ? updatedProduct : p));

        showToast(`Recovered and completed 3D model for "${product.name}"!`);
      }

      // Remove from active generations
      setActiveGenerations(prev => {
        const newMap = new Map(prev);
        newMap.delete(product.id);
        return newMap;
      });
    } catch (error) {
      console.error('Task recovery error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showToast(`Failed to recover task: ${errorMessage}`);

      setActiveGenerations(prev => {
        const newMap = new Map(prev);
        newMap.delete(product.id);
        return newMap;
      });
    }
  };

  const sideCompleteness = (p: Product) =>
    [p.image_url, p.back_image_url, p.left_image_url, p.right_image_url, p.top_image_url].filter(Boolean).length;

  /* ── client sidebar data (cheap: counts only, computed once per products change) ── */
  const clientsBySlug = useMemo(
    () => new Map(clients.map(client => [client.slug, client])),
    [clients]
  );

  const clientNavItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const key = p.client_slug || GLOBAL_KEY;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const known = clients
      .filter(c => counts.has(c.slug))
      .map(c => ({ key: c.slug, name: c.name, slug: c.slug, count: counts.get(c.slug) || 0 }));
    // Clients referenced by products but not (yet) in the /api/clients/ list
    const unknownSlugs = Array.from(counts.keys()).filter(k => k !== GLOBAL_KEY && !clientsBySlug.has(k));
    const unknown = unknownSlugs.map(slug => ({ key: slug, name: slug, slug, count: counts.get(slug) || 0 }));
    const all = [...known, ...unknown].sort((a, b) => a.name.localeCompare(b.name));
    if (counts.has(GLOBAL_KEY)) {
      all.push({ key: GLOBAL_KEY, name: 'Unassigned / Global', slug: GLOBAL_KEY, count: counts.get(GLOBAL_KEY) || 0 });
    }
    return all;
  }, [products, clients, clientsBySlug]);

  const filteredClientNav = useMemo(() => {
    if (!clientNavSearch.trim()) return clientNavItems;
    const q = clientNavSearch.toLowerCase();
    return clientNavItems.filter(c => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
  }, [clientNavItems, clientNavSearch]);

  const selectedClientLabel = useMemo(() => {
    if (selectedClientKey === ALL_KEY) return 'All products';
    if (selectedClientKey === GLOBAL_KEY) return 'Unassigned / Global';
    return clientsBySlug.get(selectedClientKey)?.name || selectedClientKey;
  }, [selectedClientKey, clientsBySlug]);

  /* ── scoped product list: client filter → search → sort → paginate ── */
  const scopedProducts = useMemo(() => {
    let list = products;
    if (selectedClientKey === GLOBAL_KEY) {
      list = list.filter(p => !p.client_slug);
    } else if (selectedClientKey !== ALL_KEY) {
      list = list.filter(p => p.client_slug === selectedClientKey);
    }
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name_desc': return b.name.localeCompare(a.name);
        case 'images_most': return sideCompleteness(b) - sideCompleteness(a);
        case 'images_least': return sideCompleteness(a) - sideCompleteness(b);
        default: return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [products, selectedClientKey, searchQ, sortKey]);

  const totalPages = Math.max(1, Math.ceil(scopedProducts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageProducts = useMemo(
    () => scopedProducts.slice((safePage - 1) * pageSize, safePage * pageSize),
    [scopedProducts, safePage, pageSize]
  );

  // Reset to page 1 whenever the scope, search, sort, or page size changes.
  useEffect(() => { setPage(1); }, [selectedClientKey, searchQ, sortKey, pageSize]);

  const selectClient = (key: string) => {
    setSelectedClientKey(key);
    setSearchQ('');
  };

  // Get texture quality for a product (default: standard)
  const getTextureQuality = (productId: number): 'standard' | 'detailed' | 'extreme' => {
    return textureQualitySelection.get(productId) || 'standard';
  };

  // Set texture quality for a product
  const setTextureQuality = (productId: number, quality: 'standard' | 'detailed' | 'extreme') => {
    setTextureQualitySelection(prev => new Map(prev).set(productId, quality));
  };

  // Get cost information for texture quality
  const getTextureQualityInfo = (quality: 'standard' | 'detailed' | 'extreme') => {
    switch (quality) {
      case 'standard':
        return { label: 'Standard', cost: '30 credits', description: 'Base quality texture' };
      case 'detailed':
        return { label: 'HD', cost: '40 credits (+10)', description: 'High detail texture' };
      case 'extreme':
        return { label: '8K', cost: '50 credits (+20)', description: 'Ultra high resolution texture' };
    }
  };

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="pm-root">
      <style>{PM_STYLES}</style>

      {/* ── Top bar ───────────────────────────── */}
      <header className="pm-topbar">
        <div className="pm-topbar-left">
          {/* <button className="pm-icon-btn" onClick={onBack} aria-label="Back to gallery">
            <ArrowLeftIcon />
          </button> */}
          <div className="pm-topbar-title">
            <h1>Products</h1>
            <p>{products.length.toLocaleString()} product{products.length !== 1 ? 's' : ''} across {clientNavItems.length} client{clientNavItems.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="pm-topbar-right">
          <a
            href="/api/products/bulk-embed-export/"
            className="pm-btn pm-btn-ghost"
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon />
            Export CSV
          </a>
          <button className="pm-btn pm-btn-primary" onClick={openCreateForm}>
            <PlusIcon />
            Add product
          </button>
        </div>
      </header>

      {/* ── Shell: client sidebar + main content ───────────────────────────── */}
      <div className="pm-shell">
        <aside className="pm-sidebar">
          <div className="pm-sidebar-search">
            <SearchIcon />
            <input
              placeholder="Find a client…"
              value={clientNavSearch}
              onChange={e => setClientNavSearch(e.target.value)}
            />
          </div>
          <nav className="pm-client-nav">
            <button
              className={`pm-client-item ${selectedClientKey === ALL_KEY ? 'active' : ''}`}
              onClick={() => selectClient(ALL_KEY)}
            >
              <span className="pm-client-name">All products</span>
              <span className="pm-client-count">{products.length.toLocaleString()}</span>
            </button>
            <div className="pm-client-nav-divider" />
            {filteredClientNav.length === 0 && (
              <p className="pm-client-nav-empty">No clients match "{clientNavSearch}".</p>
            )}
            {filteredClientNav.map(c => (
              <button
                key={c.key}
                className={`pm-client-item ${selectedClientKey === c.key ? 'active' : ''} ${c.key === GLOBAL_KEY ? 'muted' : ''}`}
                onClick={() => selectClient(c.key)}
                title={c.name}
              >
                <span className="pm-client-name">{c.name}</span>
                <span className="pm-client-count">{c.count.toLocaleString()}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="pm-main">
          {/* Scope header */}
          <div className="pm-main-header">
            <div className="pm-main-heading">
              <h2>{selectedClientLabel}</h2>
              <span className="pm-main-count">{scopedProducts.length.toLocaleString()} product{scopedProducts.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="pm-main-controls">
              <div className="pm-search">
                <SearchIcon />
                <input
                  placeholder="Search by name…"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                />
                {searchQ && (
                  <button className="pm-search-clear" onClick={() => setSearchQ('')} aria-label="Clear search">
                    <CloseIcon />
                  </button>
                )}
              </div>

              <div className="pm-view-toggle">
                <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')} title="Table view">
                  <ListIcon />
                </button>
                <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} title="Grid view">
                  <GridIcon />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          {scopedProducts.length === 0 ? (
            <div className="pm-empty">
              <div className="pm-empty-icon"><BoxIcon /></div>
              <h3>No products found</h3>
              <p>{searchQ ? 'Try a different search term.' : 'Add your first product to get started.'}</p>
              {!searchQ && (
                <button className="pm-btn pm-btn-primary" onClick={openCreateForm}>
                  <PlusIcon />
                  Add product
                </button>
              )}
            </div>
          ) : view === 'table' ? (
            <div className="pm-table-wrap pm-product-table-wrap" style={{ flex: 1, overflow: 'auto' }}>
              <table className="pm-table pm-product-table">
                <thead>
                  <tr>
                    <th className="pm-th-thumb" />
                    <th>Name</th>
                    <th>Images</th>
                    <th>Status</th>
                    <th className="pm-th-texture">Texture Quality</th>
                    <th className="pm-th-actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageProducts.map(p => {
                    const completeness = sideCompleteness(p);
                    return (
                      <tr key={p.id}>
                        <td className="pm-th-thumb">
                          <div className="pm-row-thumb">
                            {p.image_url || p.external_product_url ? (
                              <img src={resolveImageUrl(p.image_url || p.external_product_url, p.name)} alt={p.name} />
                            ) : (
                              <span>□</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="pm-row-name">{p.name}</div>
                          {p.external_product_id && <div className="pm-row-id">{p.external_product_id}</div>}
                        </td>
                        <td>
                          <span className={`pm-dot ${completeness === 5 ? 'complete' : completeness > 0 ? 'partial' : 'empty'}`} />
                          {completeness}/5
                        </td>
                        <td>
                          <div className="pm-row-tags">
                            {p.model_3d_url && <span className="pm-tag pm-tag-accent">3D</span>}
                            {p.tripo_status && <span className="pm-tag pm-tag-muted">{p.tripo_status}</span>}
                            {activeGenerations.has(p.id) && (
                              <span className="pm-tag pm-tag-accent">Generating...</span>
                            )}
                          </div>
                          {activeGenerations.has(p.id) && (
                            <div className="pm-inline-progress">
                              <div className="pm-inline-progress-bar">
                                <div
                                  className="pm-inline-progress-fill"
                                  style={{ width: `${activeGenerations.get(p.id)?.progress || 0}%` }}
                                />
                              </div>
                              <span className="pm-inline-progress-text">
                                {activeGenerations.get(p.id)?.status} ({activeGenerations.get(p.id)?.progress || 0}%)
                              </span>
                            </div>
                          )}
                          {(p.tripo_status === 'pending' || p.tripo_status === 'failed') && !activeGenerations.has(p.id) && (
                            <div className="pm-status-actions">
                              <button
                                className="pm-btn pm-btn-ghost xs"
                                onClick={() => handleRecoverTripoTask(p)}
                                title="Recover interrupted task"
                              >
                                Recover
                              </button>
                              <button
                                className="pm-btn pm-btn-ghost xs"
                                onClick={() => handleCheckTripoStatus(p.id)}
                                title="Check Tripo status"
                              >
                                Check Status
                              </button>
                              <button
                                className="pm-btn pm-btn-ghost xs"
                                onClick={() => handleResetTripoStatus(p.id)}
                                title="Reset status"
                              >
                                Reset
                              </button>
                            </div>
                          )}
                        </td>
                        <td>
                          <select
                            className="pm-texture-select"
                            value={getTextureQuality(p.id)}
                            onChange={(e) => setTextureQuality(p.id, e.target.value as 'standard' | 'detailed' | 'extreme')}
                            disabled={activeGenerations.has(p.id)}
                          >
                            <option value="standard">Standard (30 credits)</option>
                            <option value="detailed">HD (40 credits)</option>
                            <option value="extreme">8K (50 credits)</option>
                          </select>
                          <div className="pm-texture-info">
                            {getTextureQualityInfo(getTextureQuality(p.id)).description}
                          </div>
                        </td>
                        <td className="pm-th-actions">
                          <div className="pm-row-actions">
                            <button
                              className="pm-icon-btn sm"
                              title="Generate 3D model"
                              onClick={() => requestGenerate3D(p)}
                              disabled={activeGenerations.has(p.id) || (!p.image_url && !p.external_product_url)}
                            >
                              {activeGenerations.has(p.id) ? <Spinner /> : <CubeIcon />}
                            </button>
                            <button className="pm-icon-btn sm" title="View submissions" onClick={() => openSubmissions(p)}>
                              <DocumentIcon />
                            </button>
                            <button className="pm-icon-btn sm" title="Edit product" onClick={() => openEditForm(p)}>
                              <EditIcon />
                            </button>
                            <button
                              className="pm-icon-btn sm danger"
                              title="Delete product"
                              onClick={() => setConfirmDelete(p.id)}
                              disabled={deleting === p.id}
                            >
                              {deleting === p.id ? <Spinner /> : <TrashIcon />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="pm-grid" style={{ flex: 1, overflow: 'auto' }}>
              {pageProducts.map(p => {
                const completeness = sideCompleteness(p);
                return (
                  <article key={p.id} className="pm-card">

                    <div className="pm-card-img-wrap">
                      {p.image_url || p.external_product_url ? (
                        <img
                          src={resolveImageUrl(p.image_url || p.external_product_url, p.name)}
                          alt={p.name}
                          className="pm-card-img"
                        />
                      ) : (
                        <div className="pm-card-img-placeholder">
                          <span>□</span>
                        </div>
                      )}
                    </div>

                    <div className="pm-card-body">
                      <h3 className="pm-card-name" title={p.name}>{p.name}</h3>
                      {p.external_product_id && <div className="pm-card-id">{p.external_product_id}</div>}
                      {p.external_product_url && (
                        <a className="pm-card-link" href={p.external_product_url} target="_blank" rel="noreferrer">
                          <LinkIcon /> Storefront
                        </a>
                      )}
                      <div className="pm-card-tags">
                        <span className="pm-tag">{completeness}/5 sides</span>
                        {p.model_3d_url && <span className="pm-tag pm-tag-accent">3D model</span>}
                        {p.tripo_status && <span className="pm-tag pm-tag-muted">{p.tripo_status}</span>}
                        {activeGenerations.has(p.id) && (
                          <span className="pm-tag pm-tag-accent">Generating...</span>
                        )}
                      </div>
                      {activeGenerations.has(p.id) && (
                        <div className="pm-card-progress">
                          <div className="pm-card-progress-bar">
                            <div
                              className="pm-card-progress-fill"
                              style={{ width: `${activeGenerations.get(p.id)?.progress || 0}%` }}
                            />
                          </div>
                          <span className="pm-card-progress-text">
                            {activeGenerations.get(p.id)?.status} ({activeGenerations.get(p.id)?.progress || 0}%)
                          </span>
                        </div>
                      )}
                      {(p.tripo_status === 'pending' || p.tripo_status === 'failed') && !activeGenerations.has(p.id) && (
                        <div className="pm-status-actions">
                          <button
                            className="pm-btn pm-btn-ghost xs"
                            onClick={() => handleCheckTripoStatus(p.id)}
                            title="Check Tripo status"
                          >
                            Check Status
                          </button>
                          <button
                            className="pm-btn pm-btn-ghost xs"
                            onClick={() => handleResetTripoStatus(p.id)}
                            title="Reset status"
                          >
                            Reset
                          </button>
                        </div>
                      )}
                      <div className="pm-card-texture-section">
                        <select
                          className="pm-texture-select"
                          value={getTextureQuality(p.id)}
                          onChange={(e) => setTextureQuality(p.id, e.target.value as 'standard' | 'detailed' | 'extreme')}
                          disabled={activeGenerations.has(p.id)}
                        >
                          <option value="standard">Standard (30 credits)</option>
                          <option value="detailed">HD (40 credits)</option>
                          <option value="extreme">8K (50 credits)</option>
                        </select>
                        <div className="pm-texture-info">
                          {getTextureQualityInfo(getTextureQuality(p.id)).description}
                        </div>
                      </div>
                    </div>

                    <div className="pm-card-actions">
                      <button
                        className="pm-icon-btn sm"
                        title="Generate 3D model"
                        onClick={() => requestGenerate3D(p)}
                        disabled={activeGenerations.has(p.id) || (!p.image_url && !p.external_product_url)}
                      >
                        {activeGenerations.has(p.id) ? <Spinner /> : <CubeIcon />}
                      </button>
                      <button className="pm-icon-btn sm" title="View submissions" onClick={() => openSubmissions(p)}>
                        <DocumentIcon />
                      </button>
                      <button className="pm-icon-btn sm" title="Edit product" onClick={() => openEditForm(p)}>
                        <EditIcon />
                      </button>
                      <button
                        className="pm-icon-btn sm danger"
                        title="Delete product"
                        onClick={() => setConfirmDelete(p.id)}
                        disabled={deleting === p.id}
                      >
                        {deleting === p.id ? <Spinner /> : <TrashIcon />}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {scopedProducts.length > 0 && (
            <div className="pm-pagination">
              <div className="pm-pagination-size">
                <span>Rows per page</span>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
                  {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
                </select>
              </div>
              <div className="pm-pagination-info">
                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, scopedProducts.length)} of {scopedProducts.length.toLocaleString()}
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
      </div>

      {/* ── Regenerate Confirmation Modal ─────────── */}
      {regenerateConfirmProduct !== null && (
        <div className="pm-overlay" onClick={() => setRegenerateConfirmProduct(null)}>
          <div className="pm-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="pm-dialog-icon" style={{ background: 'var(--pm-warn-soft)', color: 'var(--pm-warn)' }}>
              <CubeIcon />
            </div>
            <h2>3D model already exists</h2>
            <p style={{ marginBottom: 8 }}>
              <strong>{regenerateConfirmProduct.name}</strong> already has a generated 3D model.
            </p>
            <p style={{ color: 'var(--pm-text-muted)', fontSize: '0.875rem', marginBottom: 4 }}>
              Regenerating will replace the existing model and consume additional credits based on the selected texture quality:
            </p>
            <div style={{ background: 'var(--pm-warn-soft)', border: '1px solid #FEC84B', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: '0.85rem', color: 'var(--pm-warn)', fontWeight: 600 }}>
              ⚠️ Cost: {getTextureQualityInfo(getTextureQuality(regenerateConfirmProduct.id)).cost} — {getTextureQualityInfo(getTextureQuality(regenerateConfirmProduct.id)).label} quality
            </div>
            <div className="pm-dialog-actions">
              <button className="pm-btn pm-btn-ghost" onClick={() => setRegenerateConfirmProduct(null)}>Cancel</button>
              <button
                className="pm-btn pm-btn-danger"
                onClick={() => {
                  const p = regenerateConfirmProduct;
                  setRegenerateConfirmProduct(null);
                  handleGenerate3D(p);
                }}
              >
                Yes, regenerate 3D model
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ─────────────── */}
      {confirmDelete !== null && (
        <div className="pm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="pm-dialog" onClick={e => e.stopPropagation()}>
            <div className="pm-dialog-icon danger"><TrashIcon /></div>
            <h2>Delete this product?</h2>
            <p>This permanently removes the product and all associated data. This can't be undone.</p>
            <div className="pm-dialog-actions">
              <button className="pm-btn pm-btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="pm-btn pm-btn-danger"
                disabled={deleting === confirmDelete}
                onClick={() => handleDelete(confirmDelete)}
              >
                {deleting === confirmDelete ? 'Deleting…' : 'Delete product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submissions Modal ──────────────────── */}
      {submissionsProduct && (
        <div className="pm-overlay" onClick={() => setSubmissionsProduct(null)}>
          <div className="pm-modal pm-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="pm-modal-header">
              <div>
                <h2>Submissions</h2>
                <p className="pm-modal-subtitle">{submissionsProduct.name}</p>
              </div>
              <button className="pm-icon-btn sm" onClick={() => setSubmissionsProduct(null)} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <div className="pm-modal-body">
              {submissionsLoading && (
                <div className="pm-modal-loading"><Spinner /> Loading submissions…</div>
              )}
              {!submissionsLoading && submissions.length === 0 && (
                <div className="pm-modal-empty">
                  <div className="pm-empty-icon"><DocumentIcon /></div>
                  <p>No submissions yet for this product.</p>
                </div>
              )}
              {!submissionsLoading && submissions.length > 0 && (
                <div className="pm-table-wrap">
                  <table className="pm-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Submitted</th>
                        <th>Client</th>
                        <th>Color</th>
                        <th>Method</th>
                        <th>PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((s, idx) => (
                        <tr key={s.id}>
                          <td className="pm-table-muted">{idx + 1}</td>
                          <td className="pm-table-mono">{s.created_at}</td>
                          <td>{s.client || <span className="pm-table-muted">—</span>}</td>
                          <td>
                            <span className="pm-color-cell">
                              {s.color_name || <span className="pm-table-muted">—</span>}
                            </span>
                          </td>
                          <td>{s.imprint_method || <span className="pm-table-muted">—</span>}</td>
                          <td>
                            {s.has_pdf ? (
                              <a
                                href={`/api/design-submissions/${s.id}/pdf/`}
                                target="_blank"
                                rel="noreferrer"
                                className="pm-pdf-link"
                              >
                                <DownloadIcon /> PDF
                              </a>
                            ) : <span className="pm-table-muted">No PDF</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}



      {/* ── Create / Edit Form Drawer ──────────────── */}
      {showForm && (
        <div className="pm-overlay" onClick={resetForm}>
          <div className="pm-drawer" onClick={e => e.stopPropagation()}>
            <div className="pm-drawer-header">
              <h2>{editingId ? 'Edit product' : 'New product'}</h2>
              <button className="pm-icon-btn sm" onClick={resetForm} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="pm-drawer-body" id="pm-product-form">
              {/* Name */}
              <div className="pm-field">
                <label className="pm-label">Product name</label>
                <input
                  className="pm-input"
                  placeholder="e.g. Premium Coffee Mug"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                  autoFocus
                />
              </div>

              {/* External Storefront Fields */}
              <div className="pm-field">
                <label className="pm-label">External storefront URL</label>
                <input
                  className="pm-input"
                  placeholder="https://store.com/product"
                  value={form.external_product_url || ''}
                  onChange={e => setForm(prev => ({ ...prev, external_product_url: e.target.value }))}
                />
              </div>
              <div className="pm-field">
                <label className="pm-label">External product ID</label>
                <input
                  className="pm-input pm-input-mono"
                  placeholder="e.g. NIKE12345"
                  value={form.external_product_id || ''}
                  onChange={e => setForm(prev => ({ ...prev, external_product_id: e.target.value }))}
                />
              </div>

              {/* Client */}
              <div className="pm-field">
                <label className="pm-label">Client</label>
                <select
                  className="pm-input"
                  value={form.client_slug || ''}
                  onChange={e => setForm(prev => ({ ...prev, client_slug: e.target.value || undefined }))}
                >
                  <option value="">Unassigned / Global</option>
                  {clients.map(client => (
                    <option key={client.slug} value={client.slug}>
                      {client.name} ({client.slug})
                    </option>
                  ))}
                </select>
              </div>

              {/* Side Images */}
              <div className="pm-field">
                <label className="pm-label">Product images</label>
                <p className="pm-field-help">Upload a file or paste a direct URL for each side. The URL is used when both are provided.</p>
                <div className="pm-sides-grid">
                  {SIDES.map(side => {
                    const preview = form.imagePreviews[side];
                    return (
                      <div key={side} className="pm-side-upload">
                        <div
                          className="pm-side-preview"
                          onClick={() => fileInputRefs.current[side]?.click()}
                        >
                          {preview ? (
                            <>
                              <img src={preview} alt={side} className="pm-side-img" />
                              <button
                                type="button"
                                className="pm-side-remove"
                                onClick={e => { e.stopPropagation(); clearImage(side); }}
                                aria-label={`Remove ${SIDE_LABELS[side]} image`}
                              >
                                <CloseIcon />
                              </button>
                            </>
                          ) : (
                            <span className="pm-side-plus">+</span>
                          )}
                        </div>
                        <input
                          ref={el => { fileInputRefs.current[side] = el; }}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => handleImageChange(side, e.target.files?.[0] ?? null)}
                        />
                        <span className="pm-side-label">{SIDE_LABELS[side]}</span>
                        <input
                          className="pm-input pm-input-xs"
                          placeholder="Image URL"
                          value={form.imageUrls[side] || ''}
                          onChange={e => handleImageUrlChange(side, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3D Model */}
              <div className="pm-field">
                <label className="pm-label">3D model file</label>
                <div className="pm-upload-row" onClick={() => model3dRef.current?.click()}>
                  <CubeIcon />
                  <span className="pm-upload-name">
                    {form.model3dName || 'Click to upload a .glb or .gltf file'}
                  </span>
                  <span className="pm-upload-browse">Browse</span>
                </div>
                <input
                  ref={model3dRef}
                  type="file"
                  accept=".glb,.gltf"
                  style={{ display: 'none' }}
                  onChange={e => handleModel3dChange(e.target.files?.[0] ?? null)}
                />
              </div>


            </form>

            <div className="pm-drawer-footer">
              <button type="button" className="pm-btn pm-btn-ghost" onClick={resetForm}>Cancel</button>
              <button type="submit" form="pm-product-form" className="pm-btn pm-btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create product'}
              </button>
            </div>
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
function DownloadIcon() { return <svg {...iconProps}><path d="M12 3v12M6 11l6 6 6-6M5 21h14" /></svg>; }
function DocumentIcon() { return <svg {...iconProps}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></svg>; }
function EditIcon() { return <svg {...iconProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>; }
function TrashIcon() { return <svg {...iconProps}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z" /></svg>; }
function LinkIcon() { return <svg {...iconProps} width={12} height={12}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>; }
function CubeIcon() { return <svg {...iconProps}><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z" /><path d="M3.3 7l8.7 5 8.7-5M12 22V12" /></svg>; }
function BoxIcon() { return <svg {...iconProps} width={28} height={28}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>; }
function ChevronLeftIcon() { return <svg {...iconProps}><path d="M15 18l-6-6 6-6" /></svg>; }
function ChevronRightIcon() { return <svg {...iconProps}><path d="M9 18l6-6-6-6" /></svg>; }
function ChevronsLeftIcon() { return <svg {...iconProps}><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>; }
function ChevronsRightIcon() { return <svg {...iconProps}><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>; }
function ListIcon() { return <svg {...iconProps}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>; }
function GridIcon() { return <svg {...iconProps}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>; }
function Spinner() { return <span className="pm-spinner" />; }

/* ─────────────────────────────────────────────────────────────
   Styles — scoped design system, self-contained
───────────────────────────────────────────────────────────── */
const PM_STYLES = `
.pm-root {
  --pm-bg: #F4F6F9;
  --pm-surface: #FFFFFF;
  --pm-surface-alt: #F0F2F5;
  --pm-border: #E2E5EB;
  --pm-border-strong: #CDD2DB;
  --pm-text: #12161C;
  --pm-text-muted: #5F6B7C;
  --pm-text-faint: #8B95A5;
  --pm-accent: #0C6B61;
  --pm-accent-hover: #095249;
  --pm-accent-soft: #E4F3F0;
  --pm-danger: #D92D20;
  --pm-danger-soft: #FEF3F2;
  --pm-warn: #B54708;
  --pm-warn-soft: #FFFAEB;
  --pm-radius: 12px;
  --pm-radius-sm: 8px;
  --pm-font: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --pm-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  --pm-shadow-sm: 0 1px 2px rgba(16,24,40,0.04);
  --pm-shadow: 0 2px 8px rgba(16,24,40,0.06);

  font-family: var(--pm-font);
  color: var(--pm-text);
  background: var(--pm-bg);
  height: 100%;
  min-height: 100vh;
  min-width: 100vw;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.pm-root * { box-sizing: border-box; }
.pm-root button { font-family: inherit; cursor: pointer; }
.pm-root input, .pm-root select, .pm-root textarea { font-family: inherit; }

/* Topbar */
.pm-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--pm-border);
  background: var(--pm-surface);
  flex-shrink: 0;
  box-shadow: var(--pm-shadow-sm);
  z-index: 10;
}
.pm-topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pm-topbar-title h1 {
  font-size: 1.1875rem;
  font-weight: 650;
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.pm-topbar-title p {
  font-size: 0.8125rem;
  color: var(--pm-text-muted);
  margin: 1px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pm-topbar-right { display: flex; gap: 8px; flex-shrink: 0; }

/* Buttons */
.pm-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--pm-radius-sm);
  border: 1px solid transparent;
  font-size: 0.8125rem;
  font-weight: 550;
  text-decoration: none;
  transition: background .12s, border-color .12s, color .12s, box-shadow .12s;
  white-space: nowrap;
}
.pm-btn.sm { padding: 6px 11px; font-size: 0.75rem; }
.pm-btn.xs { padding: 4px 8px; font-size: 0.6875rem; }
.pm-btn-primary {
  background: var(--pm-accent);
  color: #fff;
  box-shadow: 0 1px 2px rgba(12,107,97,0.2);
}
.pm-btn-primary:hover { background: var(--pm-accent-hover); }
.pm-btn-primary:disabled { background: var(--pm-border-strong); box-shadow: none; cursor: not-allowed; }
.pm-btn-ghost {
  background: var(--pm-surface);
  color: var(--pm-text);
  border-color: var(--pm-border);
}
.pm-btn-ghost:hover {
  background: var(--pm-surface-alt);
  border-color: var(--pm-border-strong);
}
.pm-btn-danger { background: var(--pm-danger); color: #fff; }
.pm-btn-danger:hover { background: #B42318; }
.pm-btn-danger:disabled { background: #F0A9A2; cursor: not-allowed; }

.pm-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--pm-radius-sm);
  border: 1px solid var(--pm-border);
  background: var(--pm-surface);
  color: var(--pm-text-muted);
  transition: background .12s, color .12s, border-color .12s;
  flex-shrink: 0;
}
.pm-icon-btn:hover {
  background: var(--pm-surface-alt);
  color: var(--pm-text);
  border-color: var(--pm-border-strong);
}
.pm-icon-btn.sm { width: 30px; height: 30px; }
.pm-icon-btn.danger:hover {
  background: var(--pm-danger-soft);
  color: var(--pm-danger);
  border-color: #FDA29B;
}
.pm-icon-btn:disabled { opacity: .4; cursor: not-allowed; }

/* Shell layout */
.pm-shell {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Sidebar */
.pm-sidebar {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--pm-border);
  background: var(--pm-surface);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.pm-sidebar-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 12px 6px;
  padding: 8px 11px;
  background: var(--pm-surface-alt);
  border: 1px solid transparent;
  border-radius: var(--pm-radius-sm);
  color: var(--pm-text-faint);
  transition: border-color .12s, background .12s, box-shadow .12s;
}
.pm-sidebar-search:focus-within {
  background: var(--pm-surface);
  border-color: var(--pm-accent);
  box-shadow: 0 0 0 3px var(--pm-accent-soft);
  color: var(--pm-text-muted);
}
.pm-sidebar-search svg { flex-shrink: 0; width: 14px; height: 14px; }
.pm-sidebar-search input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.8125rem;
  color: var(--pm-text);
  min-width: 0;
}
.pm-sidebar-search input::placeholder { color: var(--pm-text-faint); }

.pm-client-nav {
  display: flex;
  flex-direction: column;
  flex: 1;
  margin-left: 3px;
  overflow-y: auto;
  padding: 4px 8px 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--pm-border-strong) transparent;
}
.pm-client-nav::-webkit-scrollbar { width: 6px; }
.pm-client-nav::-webkit-scrollbar-track { background: transparent; }
.pm-client-nav::-webkit-scrollbar-thumb {
  background: var(--pm-border-strong);
  border-radius: 3px;
}
.pm-client-nav-divider {
  height: 1px;
  background: var(--pm-border);
  margin: 8px 6px 10px;
}
.pm-client-nav-empty {
  font-size: 0.75rem;
  color: var(--pm-text-faint);
  padding: 10px 8px;
  line-height: 1.4;
}
.pm-client-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 9px 11px;
  border-radius: var(--pm-radius-sm);
  border: none;
  background: none;
  text-align: left;
  font-size: 0.8125rem;
  color: var(--pm-text);
  margin-bottom: 2px;
  transition: background .1s, color .1s;
}
.pm-client-item:hover { background: var(--pm-surface-alt); }
.pm-client-item.active {
  background: var(--pm-accent-soft);
  color: var(--pm-accent-hover);
  font-weight: 600;
}
.pm-client-item.muted { font-style: italic; color: var(--pm-text-muted); }
.pm-client-item.muted.active { font-style: normal; }
.pm-client-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.pm-client-count {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--pm-text-faint);
  background: var(--pm-surface-alt);
  padding: 2px 7px;
  border-radius: 20px;
  min-width: 22px;
  text-align: center;
}
.pm-client-item.active .pm-client-count {
  background: rgba(12,107,97,0.15);
  color: var(--pm-accent-hover);
}

/* Main */
.pm-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 20px 24px 24px;
  overflow: hidden;
  background: var(--pm-bg);
}
.pm-main-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.pm-main-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.pm-main-heading h2 {
  font-size: 1.0625rem;
  font-weight: 650;
  margin: 0;
  letter-spacing: -0.01em;
}
.pm-main-count {
  font-size: 0.8125rem;
  color: var(--pm-text-muted);
  white-space: nowrap;
}
.pm-main-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* Search */
.pm-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 240px;
  padding: 7px 11px;
  background: var(--pm-surface);
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius-sm);
  color: var(--pm-text-faint);
  transition: border-color .12s, box-shadow .12s;
}
.pm-search:focus-within {
  border-color: var(--pm-accent);
  box-shadow: 0 0 0 3px var(--pm-accent-soft);
  color: var(--pm-text-muted);
}
.pm-search input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.8125rem;
  color: var(--pm-text);
  min-width: 0;
}
.pm-search input::placeholder { color: var(--pm-text-faint); }
.pm-search-clear {
  display: flex;
  color: var(--pm-text-faint);
  border: none;
  background: none;
  padding: 2px;
  border-radius: 4px;
}
.pm-search-clear:hover { color: var(--pm-text); background: var(--pm-surface-alt); }

.pm-select {
  padding: 7px 10px;
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius-sm);
  background: var(--pm-surface);
  font-size: 0.8125rem;
  color: var(--pm-text);
  outline: none;
  transition: border-color .12s;
}
.pm-select:focus { border-color: var(--pm-accent); box-shadow: 0 0 0 3px var(--pm-accent-soft); }

/* Texture quality selector */
.pm-texture-select {
  padding: 5px 8px;
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius-sm);
  background: var(--pm-surface);
  font-size: 0.75rem;
  color: var(--pm-text);
  outline: none;
  transition: border-color .12s;
  cursor: pointer;
  width: 100%;
}
.pm-texture-select:focus { border-color: var(--pm-accent); box-shadow: 0 0 0 3px var(--pm-accent-soft); }
.pm-texture-select:disabled { opacity: 0.5; cursor: not-allowed; }
.pm-texture-info {
  font-size: 0.6875rem;
  color: var(--pm-text-muted);
  margin-top: 2px;
  line-height: 1.2;
}

/* Card texture section */
.pm-card-texture-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--pm-surface-alt);
}

/* Status actions */
.pm-status-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.pm-view-toggle {
  display: flex;
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius-sm);
  overflow: hidden;
  background: var(--pm-surface);
}
.pm-view-toggle button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background: transparent;
  color: var(--pm-text-faint);
  border: none;
  border-left: 1px solid var(--pm-border);
  transition: background .1s, color .1s;
}
.pm-view-toggle button:first-child { border-left: none; }
.pm-view-toggle button:hover { color: var(--pm-text); background: var(--pm-surface-alt); }
.pm-view-toggle button.active {
  background: var(--pm-accent-soft);
  color: var(--pm-accent-hover);
}

/* Product table */
.pm-product-table-wrap {
  background: var(--pm-surface);
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius);
  overflow: hidden;
  box-shadow: var(--pm-shadow-sm);
}
.pm-product-table { font-size: 0.8125rem; }
.pm-product-table thead th { background: var(--pm-surface-alt); }
.pm-product-table tbody tr:last-child td { border-bottom: none; }
.pm-product-table tbody tr { transition: background .08s; }
.pm-th-thumb { width: 52px; }
.pm-th-actions { width: 130px; }
.pm-th-texture { width: 160px; }
.pm-row-thumb {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--pm-surface-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pm-text-faint);
  border: 1px solid var(--pm-border);
}
.pm-row-thumb img { width: 100%; height: 100%; object-fit: contain; }
.pm-row-name { font-weight: 600; line-height: 1.3; }
.pm-row-id {
  font-family: var(--pm-mono);
  font-size: 0.6875rem;
  color: var(--pm-text-faint);
  margin-top: 2px;
}
.pm-row-tags { display: flex; gap: 5px; flex-wrap: wrap; }
.pm-row-actions { display: flex; gap: 4px; justify-content: flex-end; }
.pm-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.pm-dot.complete { background: var(--pm-accent); }
.pm-dot.partial { background: #F79009; }
.pm-dot.empty { background: var(--pm-border-strong); }

/* Grid */
.pm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

/* Card */
.pm-card {
  position: relative;
  background: var(--pm-surface);
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: border-color .12s, box-shadow .12s;
  box-shadow: var(--pm-shadow-sm);
}
.pm-card:hover {
  border-color: var(--pm-border-strong);
  box-shadow: var(--pm-shadow);
}
.pm-card-flag {
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  z-index: 1;
}
.pm-card-flag.complete { background: var(--pm-accent); }
.pm-card-flag.partial { background: #F79009; }
.pm-card-flag.empty { background: var(--pm-border-strong); }
.pm-card-img-wrap {
  position: relative;
  aspect-ratio: 1.3 / 1;
  background: var(--pm-surface-alt);
  display: flex;
  align-items: center;
  justify-content: center;
}
.pm-card-img { width: 100%; height: 100%; object-fit: contain; }
.pm-card-img-placeholder { color: var(--pm-text-faint); font-size: 1.75rem; }
.pm-card-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 0.6875rem;
  font-weight: 600;
  background: rgba(255,255,255,0.94);
  color: var(--pm-text);
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid var(--pm-border);
  backdrop-filter: blur(4px);
}
.pm-card-body { padding: 12px 14px 2px; flex: 1; }
.pm-card-name {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 0 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.pm-card-id {
  font-family: var(--pm-mono);
  font-size: 0.6875rem;
  color: var(--pm-text-faint);
  margin-bottom: 4px;
}
.pm-card-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--pm-accent);
  text-decoration: none;
  margin-bottom: 6px;
}
.pm-card-link:hover { text-decoration: underline; }
.pm-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 6px 0 10px;
}
.pm-tag {
  font-size: 0.6875rem;
  font-weight: 550;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--pm-surface-alt);
  color: var(--pm-text-muted);
}
.pm-tag-accent {
  background: var(--pm-accent-soft);
  color: var(--pm-accent-hover);
}
.pm-tag-muted {
  background: var(--pm-warn-soft);
  color: var(--pm-warn);
}
.pm-card-actions {
  display: flex;
  gap: 5px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--pm-border);
  margin-top: auto;
}

/* Pagination */
.pm-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--pm-border);
}
.pm-pagination-size {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--pm-text-muted);
}
.pm-pagination-size select {
  padding: 5px 8px;
  border: 1px solid var(--pm-border);
  border-radius: 6px;
  background: var(--pm-surface);
  font-size: 0.75rem;
}
.pm-pagination-info { font-size: 0.75rem; color: var(--pm-text-muted); }
.pm-pagination-nav { display: flex; align-items: center; gap: 3px; }
.pm-pagination-page {
  font-size: 0.75rem;
  color: var(--pm-text-muted);
  margin: 0 6px;
  white-space: nowrap;
}

/* Empty state */
.pm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 64px 20px;
  text-align: center;
  background: var(--pm-surface);
  border: 1px dashed var(--pm-border-strong);
  border-radius: var(--pm-radius);
}
.pm-empty-icon { color: var(--pm-text-faint); margin-bottom: 4px; opacity: 0.7; }
.pm-empty h3 { margin: 0; font-size: 0.9375rem; font-weight: 600; }
.pm-empty p { margin: 0 0 10px; font-size: 0.8125rem; color: var(--pm-text-muted); max-width: 280px; }

/* Overlay / dialogs */
.pm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(12,16,24,0.48);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: pm-fade .15s ease-out;
}
@keyframes pm-fade { from { opacity: 0; } to { opacity: 1; } }
.pm-dialog {
  width: 380px;
  max-width: 90vw;
  background: var(--pm-surface);
  border-radius: var(--pm-radius);
  padding: 24px;
  text-align: center;
  box-shadow: 0 12px 40px rgba(16,24,40,0.18);
}
.pm-dialog-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
}
.pm-dialog-icon.danger { background: var(--pm-danger-soft); color: var(--pm-danger); }
.pm-dialog h2 { font-size: 1.0625rem; margin: 0 0 6px; font-weight: 650; }
.pm-dialog p {
  font-size: 0.8125rem;
  color: var(--pm-text-muted);
  margin: 0 0 20px;
  line-height: 1.5;
}
.pm-dialog-actions { display: flex; gap: 8px; justify-content: center; }
.pm-dialog-actions .pm-btn { flex: 1; justify-content: center; }

.pm-modal {
  width: 460px;
  max-width: 92vw;
  max-height: 85vh;
  background: var(--pm-surface);
  border-radius: var(--pm-radius);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(16,24,40,0.18);
}
.pm-modal-wide { width: 760px; }
.pm-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--pm-border);
}
.pm-modal-header h2 { font-size: 1.0625rem; margin: 0; font-weight: 650; }
.pm-modal-subtitle {
  font-size: 0.8125rem;
  color: var(--pm-text-muted);
  margin: 2px 0 0;
}
.pm-modal-body { padding: 20px; overflow-y: auto; }
.pm-modal-loading, .pm-modal-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 0;
  color: var(--pm-text-muted);
  font-size: 0.8125rem;
}

/* Generic table */
.pm-table-wrap { overflow: auto; flex: 1; }
.pm-product-table-wrap { max-height: calc(100vh - 280px); }
.pm-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
.pm-table thead th {
  text-align: left;
  padding: 9px 12px;
  color: var(--pm-text-muted);
  font-weight: 600;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: .04em;
  border-bottom: 1px solid var(--pm-border);
  background: var(--pm-surface-alt);
}
.pm-table tbody td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--pm-surface-alt);
  vertical-align: middle;
}
.pm-table tbody tr:hover { background: var(--pm-surface-alt); }
.pm-table-muted { color: var(--pm-text-faint); }
.pm-table-mono { font-family: var(--pm-mono); font-size: 0.75rem; }
.pm-color-cell { display: inline-flex; align-items: center; gap: 6px; }
.pm-color-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1px solid var(--pm-border-strong);
  display: inline-block;
  flex-shrink: 0;
}
.pm-pdf-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--pm-accent);
  background: var(--pm-accent-soft);
  padding: 4px 9px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  text-decoration: none;
  transition: background .1s;
}
.pm-pdf-link:hover { background: #D4EDE8; }

/* Fields / forms */
.pm-field { margin-bottom: 18px; }
.pm-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pm-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--pm-text);
  margin-bottom: 6px;
}
.pm-field-help {
  font-size: 0.75rem;
  color: var(--pm-text-muted);
  margin: -2px 0 8px;
  line-height: 1.4;
}
.pm-input, .pm-textarea {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--pm-border);
  border-radius: var(--pm-radius-sm);
  font-size: 0.8125rem;
  color: var(--pm-text);
  background: var(--pm-surface);
  outline: none;
  transition: border-color .12s, box-shadow .12s;
}
.pm-input:focus, .pm-textarea:focus {
  border-color: var(--pm-accent);
  box-shadow: 0 0 0 3px var(--pm-accent-soft);
}
.pm-input-xs { padding: 6px 9px; font-size: 0.75rem; margin-top: 6px; }
.pm-input-mono { font-family: var(--pm-mono); font-size: 0.75rem; }
.pm-textarea {
  height: 100px;
  resize: vertical;
  font-family: var(--pm-mono);
  font-size: 0.75rem;
  margin-bottom: 8px;
}

/* Side images */
.pm-sides-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 12px;
}
.pm-side-upload { display: flex; flex-direction: column; gap: 5px; }
.pm-side-preview {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--pm-radius-sm);
  border: 1.5px dashed var(--pm-border-strong);
  background: var(--pm-surface-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  transition: border-color .12s, background .12s;
}
.pm-side-preview:hover {
  border-color: var(--pm-accent);
  background: var(--pm-accent-soft);
}
.pm-side-img { width: 100%; height: 100%; object-fit: cover; }
.pm-side-plus { font-size: 1.25rem; color: var(--pm-text-faint); font-weight: 300; }
.pm-side-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(16,24,40,0.7);
  color: #fff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .1s;
}
.pm-side-remove:hover { background: rgba(16,24,40,0.9); }
.pm-side-remove svg { width: 10px; height: 10px; }
.pm-side-label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--pm-text-muted);
  text-align: center;
}

/* 3D upload row */
.pm-upload-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1.5px dashed var(--pm-border-strong);
  border-radius: var(--pm-radius-sm);
  color: var(--pm-text-muted);
  background: var(--pm-surface-alt);
  cursor: pointer;
  transition: border-color .12s, background .12s;
}
.pm-upload-row:hover {
  border-color: var(--pm-accent);
  background: var(--pm-accent-soft);
}
.pm-upload-name {
  flex: 1;
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-upload-browse {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--pm-accent);
}

.pm-divider { height: 1px; background: var(--pm-border); margin: 18px 0; }

/* Drawer */
.pm-drawer {
  width: 460px;
  max-width: 92vw;
  height: 100%;
  background: var(--pm-surface);
  display: flex;
  flex-direction: column;
  margin-left: auto;
  animation: pm-slide-in .2s ease-out;
  box-shadow: -8px 0 30px rgba(16,24,40,0.12);
}
@keyframes pm-slide-in {
  from { transform: translateX(32px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
.pm-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--pm-border);
  flex-shrink: 0;
}
.pm-drawer-header h2 { font-size: 1.0625rem; margin: 0; font-weight: 650; }
.pm-drawer-body { flex: 1; overflow-y: auto; padding: 20px; }
.pm-drawer-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid var(--pm-border);
  flex-shrink: 0;
  background: var(--pm-surface);
}
.pm-drawer-footer .pm-btn { min-width: 110px; justify-content: center; }

/* Spinner */
.pm-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0,0,0,0.12);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: pm-spin .6s linear infinite;
}
@keyframes pm-spin { to { transform: rotate(360deg); } }

/* Inline progress indicators */
.pm-inline-progress {
  margin-top: 6px;
}
.pm-inline-progress-bar {
  height: 4px;
  background: var(--pm-surface-alt);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 2px;
}
.pm-inline-progress-fill {
  height: 100%;
  background: var(--pm-accent);
  transition: width 0.3s ease;
}
.pm-inline-progress-text {
  font-size: 0.6875rem;
  color: var(--pm-text-muted);
  display: block;
}

/* Card progress indicators */
.pm-card-progress {
  margin-top: 6px;
}
.pm-card-progress-bar {
  height: 4px;
  background: var(--pm-surface-alt);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 2px;
}
.pm-card-progress-fill {
  height: 100%;
  background: var(--pm-accent);
  transition: width 0.3s ease;
}
.pm-card-progress-text {
  font-size: 0.6875rem;
  color: var(--pm-text-muted);
  display: block;
}

/* Responsive */

@media (max-width: 640px) {
  .pm-topbar { padding: 12px 16px; flex-wrap: wrap; }
  .pm-topbar-title p { display: none; }
  .pm-main { padding: 14px 16px 20px; }
  .pm-search { width: 100%; min-width: 0; }
  .pm-main-controls { width: 100%; }
  .pm-drawer { width: 100%; }
  .pm-field-row { grid-template-columns: 1fr; }
  .pm-th-actions { width: 120px; }
  .pm-row-actions { gap: 2px; }
  .pm-pagination { flex-direction: column; align-items: stretch; gap: 10px; }
  .pm-pagination-nav { justify-content: center; }
}
`;