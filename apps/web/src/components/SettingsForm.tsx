"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CollapsibleSection } from "@/components/CollapsibleSection";
import { ImageUploadField } from "@/components/ImageUploadField";
import type { DigestKinds } from "@timetable/shared";

import {
  BRAND_FONTS,
  DEFAULT_THEME_DARK,
  DEFAULT_THEME_LIGHT,
  FONT_PAIRINGS,
  PRESET_PALETTES,
  themeVars,
  type DigestSettings,
  type ThemeSettings,
} from "@/lib/timetableSettings";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation Theme($s: String!, $theme: String, $cover: String, $icon: String, $iconDark: String, $emoji: String) {
  updateTimetableSettings: updateForumSettings(
    idOrSlug: $s
    themeJson: $theme
    coverImageUrl: $cover
    iconUrl: $icon
    iconDarkUrl: $iconDark
    iconEmoji: $emoji
  ) { id }
}`;

// Curated quick-pick set — enough breadth for a timetable/faculty context
// without pulling in a heavyweight emoji-picker dependency.
const EMOJI_CHOICES = [
  "📚",
  "🎓",
  "🏛️",
  "🗳️",
  "💡",
  "📊",
  "📈",
  "🔬",
  "⚖️",
  "🌍",
  "🤝",
  "💬",
  "📅",
  "⭐",
  "❤️",
  "🔥",
  "🎯",
  "🧠",
  "🏆",
  "📝",
  "🎤",
  "🌱",
  "⚡",
  "🎨",
];

export type SettingsValues = {
  roleLabels?: { admin?: string; host?: string; elector?: string };
  theme?: ThemeSettings;
  coverImageUrl?: string | null;
  iconUrl?: string | null;
  iconDarkUrl?: string | null;
  iconEmoji?: string | null;
  digestDefaults?: DigestSettings;
  /** Forum-level per-kind digest defaults (2026-08-11). */
  digestKindDefaults?: DigestKinds;
};

type ThemeState = {
  primary: string;
  secondary: string;
  background: string;
  topbar: string;
  topbarText: string;
  text: string;
  font: string;
  brandFont: string;
  darkPrimary: string;
  darkSecondary: string;
  darkBackground: string;
  darkTopbar: string;
  darkTopbarText: string;
  darkText: string;
  cover: string;
  icon: string;
  iconDark: string;
  iconEmoji: string;
};

function initialLightFields(theme: ThemeSettings) {
  return {
    primary: theme.primary ?? DEFAULT_THEME_LIGHT.primary,
    secondary: theme.secondary ?? DEFAULT_THEME_LIGHT.secondary,
    background: theme.background ?? DEFAULT_THEME_LIGHT.background,
    topbar: theme.topbar ?? DEFAULT_THEME_LIGHT.topbar,
    topbarText: theme.topbarText ?? DEFAULT_THEME_LIGHT.topbarText,
    text: theme.text ?? DEFAULT_THEME_LIGHT.text,
    font: theme.font ?? DEFAULT_THEME_LIGHT.font,
    brandFont: theme.brandFont ?? DEFAULT_THEME_LIGHT.brandFont,
  };
}

function initialDarkFields(theme: ThemeSettings) {
  const dark = theme.dark ?? {};
  return {
    darkPrimary: dark.primary ?? theme.primary ?? DEFAULT_THEME_DARK.primary,
    darkSecondary:
      dark.secondary ?? theme.secondary ?? DEFAULT_THEME_DARK.secondary,
    darkBackground: dark.background ?? DEFAULT_THEME_DARK.background,
    darkTopbar: dark.topbar ?? DEFAULT_THEME_DARK.topbar,
    darkTopbarText: dark.topbarText ?? DEFAULT_THEME_DARK.topbarText,
    darkText: dark.text ?? DEFAULT_THEME_DARK.text,
  };
}

// Single source for both the initial state and what Discard restores.
function initialState(current: SettingsValues): ThemeState {
  const theme = current.theme ?? {};
  return {
    ...initialLightFields(theme),
    ...initialDarkFields(theme),
    cover: current.coverImageUrl ?? "",
    icon: current.iconUrl ?? "",
    iconDark: current.iconDarkUrl ?? "",
    iconEmoji: current.iconEmoji ?? "",
  };
}

function toTheme(state: ThemeState): ThemeSettings {
  return {
    primary: state.primary,
    secondary: state.secondary,
    background: state.background,
    topbar: state.topbar,
    topbarText: state.topbarText,
    text: state.text,
    font: state.font,
    brandFont: state.brandFont,
    dark: {
      primary: state.darkPrimary,
      secondary: state.darkSecondary,
      background: state.darkBackground,
      topbar: state.darkTopbar,
      topbarText: state.darkTopbarText,
      text: state.darkText,
    },
  };
}

type ColourFieldSpec = { id: string; label: string; key: keyof ThemeState };

const LIGHT_COLOUR_FIELDS: readonly ColourFieldSpec[] = [
  { id: "tp", label: "Primary", key: "primary" },
  { id: "ts", label: "Secondary", key: "secondary" },
  { id: "tb", label: "Background", key: "background" },
  { id: "tt", label: "Top bar", key: "topbar" },
  { id: "tti", label: "Top bar text", key: "topbarText" },
  { id: "tx", label: "Text", key: "text" },
];

const DARK_COLOUR_FIELDS: readonly ColourFieldSpec[] = [
  { id: "dp", label: "Primary", key: "darkPrimary" },
  { id: "ds", label: "Secondary", key: "darkSecondary" },
  { id: "db", label: "Background", key: "darkBackground" },
  { id: "dt", label: "Top bar", key: "darkTopbar" },
  { id: "dti", label: "Top bar text", key: "darkTopbarText" },
  { id: "dx", label: "Text", key: "darkText" },
];

function ColourGroup({
  fields,
  state,
  onChange,
}: {
  fields: readonly ColourFieldSpec[];
  state: ThemeState;
  onChange: (key: keyof ThemeState, value: string) => void;
}) {
  return (
    <div className="row wrap">
      {fields.map(({ id, label, key }) => (
        <div key={id} className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={id}>{label}</label>
          <input
            id={id}
            type="color"
            value={state[key]}
            onChange={(e) => onChange(key, e.target.value)}
            style={{ width: 64, padding: 2, height: 38 }}
          />
        </div>
      ))}
    </div>
  );
}

/** Fonts first, above the colours (QA 2026-07-29): the reading pairing and
 * a separate display face for the forum name in the topbar. */
function FontsBlock({
  state,
  onChange,
}: {
  state: ThemeState;
  onChange: (key: keyof ThemeState, value: string) => void;
}) {
  return (
    <div className="row wrap" style={{ alignItems: "flex-end" }}>
      <div
        className="field"
        style={{ marginBottom: 0, flex: 1, minWidth: 220 }}
      >
        <label htmlFor="tf">Fonts</label>
        <select
          id="tf"
          value={state.font}
          onChange={(e) => onChange("font", e.target.value)}
        >
          {Object.entries(FONT_PAIRINGS).map(([key, pairing]) => (
            <option key={key} value={key}>
              {pairing.label}
            </option>
          ))}
        </select>
      </div>
      <div
        className="field"
        style={{ marginBottom: 0, flex: 1, minWidth: 220 }}
      >
        <label htmlFor="tbf">Forum name font</label>
        <select
          id="tbf"
          value={state.brandFont}
          onChange={(e) => onChange("brandFont", e.target.value)}
        >
          {Object.entries(BRAND_FONTS).map(([key, brand]) => (
            <option key={key} value={key}>
              {brand.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** A "command" select: picking a preset fills every light + dark colour
 * field at once, then snaps back to the placeholder — the individual
 * swatches below remain the source of truth and stay tweakable. */
function PresetPicker({ onApply }: { onApply: (key: string) => void }) {
  return (
    <div className="field" style={{ margin: "14px 0 0", maxWidth: 320 }}>
      <label htmlFor="tpp">Colour presets</label>
      <select id="tpp" value="" onChange={(e) => onApply(e.target.value)}>
        <option value="" disabled>
          Apply a preset palette…
        </option>
        {Object.entries(PRESET_PALETTES).map(([key, p]) => (
          <option key={key} value={key}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmojiPicker({
  value,
  onChoose,
}: {
  value: string;
  onChoose: (value: string) => void;
}) {
  return (
    <div className="field" style={{ marginTop: 12 }}>
      <label>Or pick an emoji icon</label>
      <p className="hint" style={{ marginTop: 0 }}>
        An emoji is used instead of an uploaded image.
      </p>
      <div className="emoji-grid" role="group" aria-label="Icon emoji">
        {EMOJI_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            className={value === choice ? "emoji-choice on" : "emoji-choice"}
            aria-pressed={value === choice}
            onClick={() => onChoose(value === choice ? "" : choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      {value ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => onChoose("")}
        >
          Clear emoji
        </button>
      ) : null}
    </div>
  );
}

/** Cover image + icons (light/dark/emoji) — the non-colour media half of
 * the Theme card. */
function MediaBlock({
  slug,
  state,
  onField,
  onIcon,
  onEmoji,
  setUploadingCover,
  setUploadingIcon,
}: {
  slug: string;
  state: ThemeState;
  onField: (key: keyof ThemeState, value: string) => void;
  onIcon: (value: string) => void;
  onEmoji: (value: string) => void;
  setUploadingCover: (v: boolean) => void;
  setUploadingIcon: (v: boolean) => void;
}) {
  return (
    <>
      <div style={{ marginTop: 12 }}>
        <ImageUploadField
          id="cover"
          label="Cover image"
          hint="Shown full-width above every page at its natural aspect ratio — you choose how tall. Around 1600px wide looks sharp; up to 5 MB."
          value={state.cover}
          onChange={(value) => onField("cover", value)}
          purpose="timetable-cover"
          timetableIdOrSlug={slug}
          onUploadingChange={setUploadingCover}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <ImageUploadField
          id="icon"
          label="Icon"
          hint="Square image, shown small in the switcher and top bar — 128×128px is plenty; up to 5 MB."
          value={state.icon}
          onChange={onIcon}
          purpose="timetable-icon"
          timetableIdOrSlug={slug}
          onUploadingChange={setUploadingIcon}
        />
        <ImageUploadField
          id="icon-dark"
          label="Icon (dark mode)"
          hint="Optional alternative shown to members in dark mode — useful when the main icon vanishes on dark backgrounds. Falls back to the icon above."
          value={state.iconDark}
          onChange={(value) => onField("iconDark", value)}
          purpose="timetable-icon"
          timetableIdOrSlug={slug}
          onUploadingChange={setUploadingIcon}
        />
      </div>

      <EmojiPicker value={state.iconEmoji} onChoose={onEmoji} />
    </>
  );
}

/** Theme section of Settings (QA #59): every base colour, an optional dark
 * palette, font pairing, cover image, and icon — with live preview. */
export function SettingsForm({
  slug,
  current,
}: {
  slug: string;
  current: SettingsValues;
}) {
  const { run, busy } = useGqlAction();
  const [saved, setSaved] = useState(false);
  const initial = initialState(current);
  const [state, setState] = useState<ThemeState>(initial);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  // Live preview writes theme vars onto :root (document.documentElement) so
  // every surface updates — background, top bar, and top-bar text included —
  // and preview matches what the saved <style> tag will render. We record
  // exactly which custom properties we set, so cleanup removes precisely those;
  // without it the in-progress theme would leak onto other pages.
  const previewKeys = useRef<string[]>([]);

  const applyPreview = (theme: ThemeSettings) => {
    const root = document.documentElement;
    const mode = root.dataset.theme === "dark" ? "dark" : "light";
    // Drop the prior preview's props first so cleared values fall back to the
    // SSR <style> tag rather than lingering.
    for (const name of previewKeys.current) root.style.removeProperty(name);
    const vars = themeVars(theme, mode);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    previewKeys.current = Object.keys(vars);
  };

  const clearPreview = useCallback(() => {
    const root = document.documentElement;
    for (const name of previewKeys.current) root.style.removeProperty(name);
    previewKeys.current = [];
  }, []);

  // Strip any preview overrides when the form unmounts (navigating away) so the
  // in-progress theme can't leak onto other pages; the SSR <style> tag remains
  // the source of truth.
  useEffect(() => clearPreview, [clearPreview]);

  function setField(key: keyof ThemeState, value: string) {
    setState((s) => ({ ...s, [key]: value }));
  }

  // Colour and font edits re-render the live preview alongside the state.
  function setThemeField(key: keyof ThemeState, value: string) {
    setField(key, value);
    applyPreview(toTheme({ ...state, [key]: value }));
  }

  // A preset fills every light+dark colour field at once (QA 2026-07-29);
  // fonts are untouched and everything stays individually tweakable after.
  function applyPreset(key: string) {
    const p = PRESET_PALETTES[key];
    if (!p) return;
    const next: ThemeState = {
      ...state,
      primary: p.light.primary,
      secondary: p.light.secondary,
      background: p.light.background,
      topbar: p.light.topbar,
      topbarText: p.light.topbarText,
      text: p.light.text,
      darkPrimary: p.dark.primary,
      darkSecondary: p.dark.secondary,
      darkBackground: p.dark.background,
      darkTopbar: p.dark.topbar,
      darkTopbarText: p.dark.topbarText,
      darkText: p.dark.text,
    };
    setState(next);
    applyPreview(toTheme(next));
  }

  // Emoji and uploaded image are mutually exclusive icon sources — setting one
  // clears the other so the render precedence (emoji > image > letter) is
  // unambiguous.
  function chooseEmoji(value: string) {
    setField("iconEmoji", value);
    if (value) {
      setField("icon", "");
      setField("iconDark", "");
    }
  }
  function handleIconChange(value: string) {
    setField("icon", value);
    if (value.trim()) setField("iconEmoji", "");
  }

  function discard() {
    setState(initial);
    // Reset: drop the inline overrides so the page falls back to the saved
    // theme rendered by the SSR <style> tag.
    clearPreview();
    setSaved(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    void run(
      MUTATION,
      {
        s: slug,
        theme: JSON.stringify(toTheme(state)),
        // Empty strings, not null: the API treats null as "leave unchanged",
        // so clearing a field must send "" for the image/emoji to be removed.
        cover: state.cover.trim(),
        icon: state.icon.trim(),
        iconDark: state.iconDark.trim(),
        emoji: state.iconEmoji.trim(),
      },
      {
        success: "Theme saved",
        errorFallback: "Could not save theme",
        onSuccess: () => setSaved(true),
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <CollapsibleSection title="Theme">
        <p className="hint" style={{ marginTop: 0 }}>
          Colours preview live — Save to keep them, Discard to revert.
        </p>

        <FontsBlock state={state} onChange={setThemeField} />

        <PresetPicker onApply={applyPreset} />

        <h3 style={{ fontSize: "var(--text-md)", margin: "14px 0 2px" }}>
          Light palette
        </h3>
        <ColourGroup
          fields={LIGHT_COLOUR_FIELDS}
          state={state}
          onChange={setThemeField}
        />

        <h3 style={{ fontSize: "var(--text-md)", margin: "18px 0 2px" }}>
          Dark mode palette
        </h3>
        <p
          className="faint"
          style={{ marginTop: 0, fontSize: "var(--text-xs)" }}
        >
          Used when a member switches to dark mode (sidebar toggle).
        </p>
        <ColourGroup
          fields={DARK_COLOUR_FIELDS}
          state={state}
          onChange={setThemeField}
        />

        <MediaBlock
          slug={slug}
          state={state}
          onField={setField}
          onIcon={handleIconChange}
          onEmoji={chooseEmoji}
          setUploadingCover={setUploadingCover}
          setUploadingIcon={setUploadingIcon}
        />

        <FormFooter
          busy={busy}
          saved={saved}
          uploading={uploadingCover || uploadingIcon}
          onDiscard={discard}
        />
      </CollapsibleSection>
    </form>
  );
}

function FormFooter({
  busy,
  saved,
  uploading,
  onDiscard,
}: {
  busy: boolean;
  saved: boolean;
  uploading: boolean;
  onDiscard: () => void;
}) {
  const label = uploading
    ? "Uploading…"
    : busy
      ? "Saving…"
      : saved
        ? "Saved"
        : "Save theme";
  return (
    <div className="row" style={{ marginTop: 12 }}>
      <button
        className="btn btn-primary"
        type="submit"
        disabled={busy || uploading}
      >
        {label}
      </button>
      <button
        className="btn btn-ghost"
        type="button"
        onClick={onDiscard}
        disabled={busy}
      >
        Discard
      </button>
    </div>
  );
}
