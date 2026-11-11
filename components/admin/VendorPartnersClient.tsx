"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createVendorPartner,
  updateVendorPartner,
  deleteVendorPartner,
  uploadVendorPartnerPhoto,
  removeVendorPartnerGalleryPhoto,
} from "@/app/admin/(panel)/vendors/actions";
import { VENDOR_PARTNER_CATEGORIES } from "@/lib/vendor-partners/categories";
import { CATEGORY_LABELS } from "@/components/vendor-partners/PartnerCard";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

type Draft = {
  category: VendorPartner["category"];
  name: string;
  city: string;
  shortDescription: string;
  fullDescription: string;
  phone: string;
  viberPhone: string;
  whatsappPhone: string;
  websiteUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  isFeatured: boolean;
};

const EMPTY: Draft = {
  category: "music",
  name: "",
  city: "",
  shortDescription: "",
  fullDescription: "",
  phone: "",
  viberPhone: "",
  whatsappPhone: "",
  websiteUrl: "",
  instagramUrl: "",
  facebookUrl: "",
  isFeatured: false,
};

function toInput(d: Draft) {
  return {
    category: d.category,
    name: d.name,
    city: d.city,
    shortDescription: d.shortDescription,
    fullDescription: d.fullDescription || null,
    phone: d.phone || null,
    viberPhone: d.viberPhone || null,
    whatsappPhone: d.whatsappPhone || null,
    websiteUrl: d.websiteUrl || null,
    instagramUrl: d.instagramUrl || null,
    facebookUrl: d.facebookUrl || null,
    isFeatured: d.isFeatured,
  };
}

export function VendorPartnersClient({ vendors }: { vendors: VendorPartner[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function remove(vendorId: string, name: string) {
    if (!window.confirm(`Да се избрише „${name}“?`)) return;
    const result = await deleteVendorPartner({ vendorId });
    if (result.ok) router.refresh();
    else setStatus(result.error);
  }

  return (
    <section className="panel">
      <div className="panel-h">
        <h2 className="panel-t">Соработници</h2>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          Додади соработник
        </button>
      </div>
      {status ? <p className="s1-empty">{status}</p> : null}
      {vendors.length === 0 ? <p className="s1-empty">Нема соработници. Додадете го првиот подолу.</p> : null}
      {vendors.map((v) => (
        <div key={v.id} className="s1-price-card">
          <div className="s1-price-card-head">
            <b>{v.name}</b>
            <span className="pill">{CATEGORY_LABELS[v.category]}</span>
            {v.is_featured ? <span className="pill p-ok">Издвоено</span> : null}
          </div>
          <p>
            {v.city} — {v.short_description}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setEditingId(v.id)}>
              Уреди
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => remove(v.id, v.name)}>
              Избриши
            </button>
          </div>
          {editingId === v.id ? (
            <VendorForm
              vendorId={v.id}
              initial={{
                category: v.category,
                name: v.name,
                city: v.city,
                shortDescription: v.short_description,
                fullDescription: v.full_description ?? "",
                phone: v.phone ?? "",
                viberPhone: v.viber_phone ?? "",
                whatsappPhone: v.whatsapp_phone ?? "",
                websiteUrl: v.website_url ?? "",
                instagramUrl: v.instagram_url ?? "",
                facebookUrl: v.facebook_url ?? "",
                isFeatured: v.is_featured,
              }}
              coverPhotoPath={v.cover_photo_path}
              galleryPhotoPaths={v.gallery_photo_paths}
              onDone={() => {
                setEditingId(null);
                router.refresh();
              }}
            />
          ) : null}
        </div>
      ))}
      {adding ? (
        <VendorForm
          vendorId={null}
          initial={EMPTY}
          coverPhotoPath={null}
          galleryPhotoPaths={[]}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function VendorForm({
  vendorId,
  initial,
  coverPhotoPath,
  galleryPhotoPaths,
  onDone,
}: {
  vendorId: string | null;
  initial: Draft;
  coverPhotoPath: string | null;
  galleryPhotoPaths: string[];
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const input = toInput(draft);
    const result = vendorId ? await updateVendorPartner({ vendorId, ...input }) : await createVendorPartner(input);
    setPending(false);
    if (result.ok) onDone();
    else setError(result.error);
  }

  async function uploadCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !vendorId) return;
    const result = await uploadVendorPartnerPhoto({ vendorId, purpose: "cover", file });
    if (!result.ok) setError(result.error);
  }

  async function uploadGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !vendorId) return;
    const result = await uploadVendorPartnerPhoto({ vendorId, purpose: "gallery", file });
    if (!result.ok) setError(result.error);
  }

  async function removeGalleryPhoto(path: string) {
    if (!vendorId) return;
    const result = await removeVendorPartnerGalleryPhoto({ vendorId, path });
    if (!result.ok) setError(result.error);
  }

  const uid = vendorId ?? "new";

  return (
    <form onSubmit={save} className="s1-price-fields">
      {error ? <p className="s1-empty">{error}</p> : null}
      <div>
        <label className="lab-s" htmlFor={`vp-category-${uid}`}>
          Категорија
        </label>
        <select id={`vp-category-${uid}`} className="fld" value={draft.category} onChange={(e) => set({ category: e.target.value as Draft["category"] })}>
          {VENDOR_PARTNER_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-name-${uid}`}>
          Име
        </label>
        <input id={`vp-name-${uid}`} className="fld" value={draft.name} onChange={(e) => set({ name: e.target.value })} required />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-city-${uid}`}>
          Град
        </label>
        <input id={`vp-city-${uid}`} className="fld" value={draft.city} onChange={(e) => set({ city: e.target.value })} required />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-short-${uid}`}>
          Краток опис
        </label>
        <input id={`vp-short-${uid}`} className="fld" value={draft.shortDescription} onChange={(e) => set({ shortDescription: e.target.value })} required />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-full-${uid}`}>
          Целосен опис
        </label>
        <textarea id={`vp-full-${uid}`} className="fld" value={draft.fullDescription} onChange={(e) => set({ fullDescription: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-phone-${uid}`}>
          Телефон
        </label>
        <input id={`vp-phone-${uid}`} className="fld" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-viber-${uid}`}>
          Viber
        </label>
        <input id={`vp-viber-${uid}`} className="fld" value={draft.viberPhone} onChange={(e) => set({ viberPhone: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-whatsapp-${uid}`}>
          WhatsApp
        </label>
        <input id={`vp-whatsapp-${uid}`} className="fld" value={draft.whatsappPhone} onChange={(e) => set({ whatsappPhone: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-website-${uid}`}>
          Веб-страница
        </label>
        <input id={`vp-website-${uid}`} className="fld" value={draft.websiteUrl} onChange={(e) => set({ websiteUrl: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-instagram-${uid}`}>
          Instagram
        </label>
        <input id={`vp-instagram-${uid}`} className="fld" value={draft.instagramUrl} onChange={(e) => set({ instagramUrl: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-facebook-${uid}`}>
          Facebook
        </label>
        <input id={`vp-facebook-${uid}`} className="fld" value={draft.facebookUrl} onChange={(e) => set({ facebookUrl: e.target.value })} />
      </div>
      <label className="lab-s">
        <input type="checkbox" checked={draft.isFeatured} onChange={(e) => set({ isFeatured: e.target.checked })} /> Издвоено
      </label>
      {vendorId ? (
        <>
          <div>
            <label className="lab-s" htmlFor={`vp-cover-${uid}`}>
              Насловна фотографија {coverPhotoPath ? "(поставена)" : ""}
            </label>
            <input id={`vp-cover-${uid}`} className="fld" type="file" accept="image/*" onChange={uploadCover} />
          </div>
          <div>
            <label className="lab-s" htmlFor={`vp-gallery-${uid}`}>
              Додади фотографија во галеријата ({galleryPhotoPaths.length})
            </label>
            <input id={`vp-gallery-${uid}`} className="fld" type="file" accept="image/*" onChange={uploadGallery} />
            {galleryPhotoPaths.map((p) => (
              <button key={p} type="button" className="btn btn-ghost" onClick={() => removeGalleryPhoto(p)}>
                Отстрани {p.split("/").pop()}
              </button>
            ))}
          </div>
          <p className="s1-empty" style={{ fontSize: 12.5 }}>
            Фотографиите стануваат видливи на платформата веднаш штом се прикачени.
          </p>
        </>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        Зачувај
      </button>
    </form>
  );
}
