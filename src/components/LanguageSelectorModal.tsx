import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Check, Globe, Sparkles, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../locales/languages";

interface LanguageSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLanguage: string;
  onSelectLanguage: (code: string) => void;
}

export default function LanguageSelectorModal({
  isOpen,
  onClose,
  currentLanguage,
  onSelectLanguage,
}: LanguageSelectorModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Filter languages based on search query (matches name, englishName, code, or region)
  const filteredLanguages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.englishName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        l.region.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const availableLanguages = useMemo(
    () => filteredLanguages.filter((l) => l.available),
    [filteredLanguages]
  );

  const upcomingLanguages = useMemo(
    () => filteredLanguages.filter((l) => !l.available),
    [filteredLanguages]
  );

  const handleSelect = (code: string, available: boolean) => {
    if (!available) return;
    onSelectLanguage(code);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="language-modal-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative w-full max-w-lg bg-white dark:bg-gray-900 border-t sm:border border-gray-200 dark:border-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[88vh] sm:max-h-[82vh]"
          >
            {/* Drag handle for mobile */}
            <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mt-3 sm:hidden" />

            {/* Header */}
            <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-800/80">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: "var(--primary-soft, rgba(255, 145, 0, 0.15))",
                    color: "var(--primary, #ff9100)",
                  }}
                >
                  <Globe size={18} />
                </div>
                <div>
                  <h2
                    id="language-modal-title"
                    className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight"
                  >
                    {t("settings.language.selectTitle")}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("settings.language.desc")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Bar */}
            <div className="px-5 pt-3 pb-2">
              <div className="relative flex items-center">
                <Search
                  size={16}
                  className="absolute left-3.5 text-gray-400 dark:text-gray-500 pointer-events-none"
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("settings.language.searchPlaceholder")}
                  className="w-full pl-9 pr-8 py-2.5 bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700/80 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Language Lists (Scrollable) */}
            <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4">
              {availableLanguages.length === 0 && upcomingLanguages.length === 0 && (
                <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  {t("settings.language.noResults")}
                </div>
              )}

              {/* Available Languages */}
              {availableLanguages.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">
                    {t("settings.language.available")}
                  </h3>
                  <div className="space-y-1.5" role="radiogroup" aria-label={t("settings.language.available")}>
                    {availableLanguages.map((lang) => {
                      const isSelected = currentLanguage.startsWith(lang.code);
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => handleSelect(lang.code, lang.available)}
                          className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                            isSelected
                              ? "border-primary-500/60 bg-primary-500/10 shadow-sm"
                              : "border-gray-200/80 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg shadow-inner shrink-0">
                              {lang.flag}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                                  {lang.name}
                                </span>
                                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60">
                                  {lang.badge}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                {lang.englishName} · {lang.region}
                              </p>
                            </div>
                          </div>

                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0.6, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 ml-2 shadow-sm"
                              style={{ backgroundColor: "var(--primary, #ff9100)" }}
                            >
                              <Check size={16} strokeWidth={2.5} />
                            </motion.div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Upcoming Languages (Shows Future Extensibility) */}
              {upcomingLanguages.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      {t("settings.language.comingSoon")}
                    </h3>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {upcomingLanguages.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {upcomingLanguages.map((lang) => (
                      <div
                        key={lang.code}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 dark:border-gray-800/60 bg-gray-50/60 dark:bg-gray-800/20 opacity-75"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-base shrink-0">{lang.flag}</span>
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 block truncate">
                              {lang.name}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 block truncate">
                              {lang.englishName}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-200/70 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0 ml-1">
                          {t("settings.language.comingSoonBadge")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Community Translation Banner */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-primary-500/10 via-primary-500/5 to-transparent border border-primary-500/20 text-gray-900 dark:text-gray-100 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400">
                  <Sparkles size={14} />
                  <span>{t("settings.language.helpTranslate")}</span>
                </div>
                <a
                  href="https://github.com/sametalkis/Vukuf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-primary-500 dark:hover:text-primary-400 underline underline-offset-2 transition-colors"
                >
                  <span>{t("settings.language.helpTranslateLink")}</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
