---
name: responsive-companion
description: >-
  Enforces desktop and mobile responsive design parity, floating dock layering,
  touch/mouse interaction parity, and OLED dark theme standards for the Vukuf (Simple Time Tracker) project.
  Use whenever modifying, creating, or auditing UI components, floating bars, modals, or layouts in this project.
---

# Vukuf Responsive & Multi-Platform Design Skill

Tüm Vukuf (Simple Time Tracker) bileşenlerinin hem mobil (360px–430px) hem de masaüstü (1024px–2560px+) ekranlarda kusursuz görünmesi ve çalışması için standartlar ve kurallar rehberi.

---

## 📐 1. Yüzen Elemanlar ve Dock Standartları (Floating Docks & Bars)

### ❌ Asla Yapılmaması Gerekenler:
- Masaüstünde `fixed left-0 right-0 bottom-*` ile ekranı uçtan uca kaplayan çubuklar yapmak (ultra-geniş ekranlarda butonlar aşırı uzar ve bozulur).
- Aynı anda birden fazla yüzen çubuğu (örneğin hem `DateSelectorBar` hem `BulkActionBar`) aynı dikey konumda üst üste bindirmek.
- `pointer-events-none` kullanmadan tam ekran fixed kapsayıcı koyup altındaki tıklamaları engellemek.

### ✅ Standart Çözüm (Floating Dock Pattern):
Vukuf arayüzündeki tüm alt çubuklar ve yüzen paneller tek bir kapsül genişlik standardına (`width: min(92vw, 420px)`) uymalıdır:

```tsx
// Standart Yüzen Eylem Çubuğu
<motion.div
  initial={{ y: 40, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  exit={{ y: 40, opacity: 0 }}
  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
  className="fixed left-1/2 -translate-x-1/2 z-50 pointer-events-none"
  style={{
    width: 'min(92vw, 420px)',
    bottom: 'calc(80px + env(safe-area-inset-bottom, 14px))',
  }}
>
  <div className="w-full pointer-events-auto bg-[#141414]/95 backdrop-blur-xl border border-neutral-800 rounded-2xl px-4 py-3 shadow-2xl">
    {/* İçerik */}
  </div>
</motion.div>
```

---

## 🥞 2. Katman (Z-Index & Vertical Spacing) Hiyerarşisi

1. **Sayfa İçeriği:** Alt padding her zaman `pb-[168px]` olmalıdır. Yüzen dock'lar içeriği örtmemelidir.
2. **Alt Navigasyon (`.bottom-nav`):**
   - Konum: `bottom: 16px; left: 50%; transform: translateX(-50%);`
   - Genişlik: `min(92vw, 420px)`
   - Yükseklik: `58px`
   - Z-Index: `z-40`
3. **Yüzen Fonksiyon Çubukları (`DateSelectorBar`, `BulkActionBar`):**
   - Konum: `bottom: calc(80px + env(safe-area-inset-bottom, 14px)); left: 50%; -translate-x-1/2;`
   - Genişlik: `min(92vw, 420px)`
   - Z-Index: `z-40` (Normal) veya `z-50` (Aksiyon Çubuğu)
   - **Kural:** Çoklu seçim modu gibi geçici bir eylem çubuğu açıldığında, altındaki `DateSelectorBar` gizlenmelidir.
4. **Modallar ve Dialoglar:**
   - Z-Index: `z-[60]` veya `z-[70]`
   - Mobilde: Tam ekran veya alt sayfa (bottom sheet)
   - Masaüstünde: `sm:max-w-md sm:rounded-3xl sm:h-auto sm:max-h-[90vh]` ve ortalanmış kart.

---

## 🖱️ 3. Dokunmatik & Fare Etkileşim Eşitliği (Touch & Mouse Parity)

- **Uzun Basma (Long Press):** Mobilde 450ms basılı tutarak çoklu seçim tetiklenir.
- **Sağ Tık (Context Menu):** Masaüstünde kayda sağ tıklanarak (`onContextMenu`) anında çoklu seçime geçilebilir.
- **Görsel Seçim Butonu:** Arayüzde açıkça görünen bir "Seç" butonu bulunmalıdır (özellikle masaüstü kullanıcılarının keşfedebilmesi için).
- **Hover & Tap Feedback:** Tüm butonlarda `cursor-pointer`, mobilde `whileTap={{ scale: 0.95 }}`, masaüstünde `hover:bg-*` mikro-etkileşimleri olmalıdır.

---

## 🎨 4. Tasarım Dili (OLED & Impeccable)

- **Arka Plan:** Tam siyah `#0a0a0a` / `#121212`.
- **Kartlar:** `#141414` veya `#171717`.
- **Kenarlıklar:** İnce ve zarif `#262626` / `border-neutral-800`.
- **Blur:** Şeffaf panellerde `backdrop-blur-xl` veya `backdrop-blur-md`.

---

## 🌐 5. İki Dilli Destek (i18n)

- Eklenen her kullanıcı metni mutlaka hem `src/locales/tr.ts` hem de `src/locales/en.ts` dosyalarına eklenmelidir.
- Kod içinde sabit Türkçe veya İngilizce string bırakılmamalıdır (`t('key')`).

---

## 🔒 6. Doğrulama ve Commit Kuralı

- Değişiklik sonrası mutlaka `npx tsc --noEmit` ve `npm run build` test edilmelidir.
- Kullanıcı açıkça izin vermedikçe commit atılmamalıdır.
