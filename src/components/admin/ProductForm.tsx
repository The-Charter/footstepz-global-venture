import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError, type Product } from '@/lib/api'
import { ProductImage } from '../ProductGrid'

const MAX_BYTES = 2 * 1024 * 1024
const SUGGESTED = ['Sneakers', 'Formal', 'Sandals', 'Boots', 'Slides', 'Sports']

export function ProductForm({ product, onDone }: { product: Product | null; onDone: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState(product?.category ?? '')
  const [price, setPrice] = useState(product?.price ?? '')
  const [sizes, setSizes] = useState(product?.sizes.join(', ') ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
  }, [])

  function pickFile(f: File | undefined) {
    setError(null)
    if (!f) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return setError('Photo must be a JPEG, PNG or WebP image.')
    if (f.size > MAX_BYTES) return setError('Photo must be 2 MB or smaller.')
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = URL.createObjectURL(f)
    setPreview(previewRef.current)
    setFile(f)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!product && !file) return setError('Add a photo of the footwear.')
    const form = new FormData()
    form.set('name', name)
    form.set('category', category)
    form.set('price', price)
    form.set('sizes', JSON.stringify(sizes.split(',').map((s) => s.trim()).filter(Boolean)))
    if (file) form.set('image', file)
    setBusy(true)
    try {
      await api.saveProduct(form, product?.id)
      await qc.invalidateQueries({ queryKey: ['products'] })
      toast.success(product ? 'Listing updated' : 'Listing published')
      if (!product) {
        setName('')
        setCategory('')
        setPrice('')
        setSizes('')
        setFile(null)
        setPreview(null)
        if (fileRef.current) fileRef.current.value = ''
      }
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the listing. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="glass space-y-4 rounded-3xl p-5">
      <h2 className="display text-xl font-bold">{product ? 'Edit listing' : 'Add new footwear'}</h2>

      <div>
        <span className="mb-1.5 block text-sm font-semibold">Photo</span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center gap-4 rounded-2xl p-3 text-left transition-colors hover:bg-black/[0.03]"
          style={{ border: '1.5px dashed var(--border-strong)' }}
        >
          {preview || product?.imageUrl ? (
            <ProductImage product={{ imageUrl: preview ?? product?.imageUrl ?? null, name: name || 'Preview' }} className="size-20 shrink-0 rounded-xl" />
          ) : (
            <span className="flex size-20 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--surface-muted)' }}>
              <ImagePlus className="size-6" style={{ color: 'var(--subtle)' }} />
            </span>
          )}
          <span className="text-sm">
            <span className="block font-semibold">{file ? file.name : product ? 'Replace photo (optional)' : 'Upload photo'}</span>
            <span style={{ color: 'var(--muted)' }}>JPEG, PNG or WebP, up to 2 MB</span>
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} aria-label="Photo file" />
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="e.g. Lagos Runner" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Category</span>
          <input className="field" list="category-suggestions" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={30} required placeholder="e.g. Sneakers" />
          <datalist id="category-suggestions">
            {SUGGESTED.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Price (USDC)</span>
          <input className="field tabular-nums" inputMode="decimal" value={price} onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && setPrice(e.target.value)} required placeholder="45.00" />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Available sizes</span>
        <input className="field" value={sizes} onChange={(e) => setSizes(e.target.value)} required placeholder="40, 41, 42, 43" />
        <span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>
          Separate sizes with commas.
        </span>
      </label>

      {error && (
        <p className="rounded-xl p-3 text-sm" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }} role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} {product ? 'Save changes' : 'Publish listing'}
        </button>
        {product && (
          <button type="button" className="btn-ghost" onClick={onDone} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
