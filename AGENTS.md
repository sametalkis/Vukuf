# Vukuf (Simple Time Tracker) Agent Guidelines

## 📱 Desktop & Mobile Responsive Parity
- **Yüzen Paneller & Alt Barlar (Floating Docks):** Tüm yüzen alt çubuklar (`BulkActionBar`, `DateSelectorBar` vb.) yatayda tam ortalanmalı ve genişlikleri `max-w-[420px]` ile sınırlandırılmalıdır. Asla masaüstünde `fixed left-0 right-0` ile uçtan uca uzatılmamalıdır.
- **Framer Motion + Tailwind Transform Çakışması (ÖNEMLİ):** `motion.div` üzerinde `animate={{ y: ... }}` kullanılırken ASLA `left-1/2 -translate-x-1/2` kullanılmamalıdır! Framer Motion'ın inline transform'u Tailwind'in `translateX(-50%)` kuralını ezerek elemanı ekranın sağına kaydırır. Bunun yerine daima dışta `fixed left-0 right-0 flex justify-center pointer-events-none` kapsayıcısı kullanılmalı, içteki `motion.div` `w-full max-w-[420px] pointer-events-auto` olarak Flexbox ile ortalanmalıdır.
- **Dock Çakışmaları:** Çoklu seçim eylem çubuğu açıldığında alttaki `DateSelectorBar` gizlenmelidir. Yüzen çubukların alt mesafesi `bottom: calc(80px + env(safe-area-inset-bottom, 14px))` standardında tutulmalı, `.bottom-nav` (`z-40`, `bottom: 16px`) ile çakışmamalıdır.
- **Modallar:** Mobilde tam ekran/alt sayfa (bottom-sheet), masaüstünde `sm:max-w-md sm:rounded-3xl` ortalanmış modal kart olmalıdır.
- **Etkileşim:** Mobilde dokunmatik/uzun basma desteklenirken masaüstünde tıklama, sağ tık (`onContextMenu`) ve belirgin arayüz butonları bulunmalıdır.

## 🎨 Tasarım & OLED Tema
- Tam siyah OLED arka plan (`#0a0a0a` / `#121212`), `#141414` kartlar, `border-neutral-800` kenarlıklar.

## 🌐 Yerelleştirme (i18n)
- Eklenen her kullanıcı metni hem `src/locales/tr.ts` hem de `src/locales/en.ts` dosyalarına eklenmelidir.

## 🔒 Kurallar
- Kullanıcı açıkça talimat vermedikçe git commit yapılmamalıdır ("ben demeden o değişikliği commitleme").
- Değişikliklerden sonra `npx tsc --noEmit` ve `npm run build` ile üretim derlemesi doğrulanmalıdır.
